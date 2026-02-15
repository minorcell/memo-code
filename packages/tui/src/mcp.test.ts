import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { writeMemoConfig, type MemoConfig } from '@memo/core'

vi.mock('@memo/tools/router/mcp/oauth', async () => {
    const actual = await vi.importActual('@memo/tools/router/mcp/oauth')
    return {
        ...(actual as object),
        getMcpAuthStatus: vi.fn(),
        loginMcpServerOAuth: vi.fn(),
        logoutMcpServerOAuth: vi.fn(),
    }
})

import {
    getMcpAuthStatus,
    loginMcpServerOAuth,
    logoutMcpServerOAuth,
} from '@memo/tools/router/mcp/oauth'
import { runMcpCommand } from './mcp'

function baseConfig(): MemoConfig {
    return {
        current_provider: 'deepseek',
        providers: [
            {
                name: 'deepseek',
                env_api_key: 'DEEPSEEK_API_KEY',
                model: 'deepseek-chat',
            },
        ],
        mcp_servers: {},
    }
}

async function withMemoHome(config: MemoConfig, run: () => Promise<void>) {
    const originalMemoHome = process.env.MEMO_HOME
    const home = await mkdtemp(join(tmpdir(), 'memo-tui-mcp-'))
    process.env.MEMO_HOME = home
    await writeMemoConfig(join(home, 'config.toml'), config)

    try {
        await run()
    } finally {
        if (originalMemoHome === undefined) {
            delete process.env.MEMO_HOME
        } else {
            process.env.MEMO_HOME = originalMemoHome
        }
        await rm(home, { recursive: true, force: true })
    }
}

function captureConsole() {
    const logs: string[] = []
    const errors: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        logs.push(args.map((arg) => String(arg)).join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args.map((arg) => String(arg)).join(' '))
    })
    return { logs, errors }
}

afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
})

describe('runMcpCommand', () => {
    test('list --json includes auth_status for each server', async () => {
        await withMemoHome(
            {
                ...baseConfig(),
                mcp_servers: {
                    local: {
                        command: 'node',
                        args: ['server.js'],
                    },
                    remote: {
                        type: 'streamable_http',
                        url: 'https://example.com/mcp',
                    },
                },
            },
            async () => {
                const { logs } = captureConsole()
                vi.mocked(getMcpAuthStatus).mockImplementation(async (config) => {
                    if ('url' in config) return 'not_logged_in'
                    return 'unsupported'
                })

                await runMcpCommand(['list', '--json'])

                const payload = JSON.parse(logs.join('\n')) as Record<
                    string,
                    { auth_status: string }
                >
                assert.strictEqual(payload.local?.auth_status, 'unsupported')
                assert.strictEqual(payload.remote?.auth_status, 'not_logged_in')
            },
        )
    })

    test('login forwards scopes and reports success', async () => {
        await withMemoHome(
            {
                ...baseConfig(),
                mcp_servers: {
                    remote: {
                        type: 'streamable_http',
                        url: 'https://example.com/mcp',
                    },
                },
            },
            async () => {
                const { logs } = captureConsole()
                vi.mocked(loginMcpServerOAuth).mockResolvedValue({
                    backend: 'file',
                })

                await runMcpCommand(['login', 'remote', '--scopes', 'read,write'])

                expect(loginMcpServerOAuth).toHaveBeenCalledWith(
                    expect.objectContaining({
                        serverName: 'remote',
                        scopes: ['read', 'write'],
                    }),
                )
                expect(logs.join('\n')).toContain('OAuth login completed for "remote"')
            },
        )
    })

    test('logout reports when credentials were removed', async () => {
        await withMemoHome(
            {
                ...baseConfig(),
                mcp_servers: {
                    remote: {
                        type: 'streamable_http',
                        url: 'https://example.com/mcp',
                    },
                },
            },
            async () => {
                const { logs } = captureConsole()
                vi.mocked(logoutMcpServerOAuth).mockResolvedValue({
                    backend: 'file',
                    removed: true,
                })

                await runMcpCommand(['logout', 'remote'])

                expect(logs.join('\n')).toContain('Removed OAuth credentials for "remote".')
            },
        )
    })

    test('login rejects stdio server', async () => {
        await withMemoHome(
            {
                ...baseConfig(),
                mcp_servers: {
                    local: {
                        command: 'node',
                        args: ['server.js'],
                    },
                },
            },
            async () => {
                const { errors } = captureConsole()
                await runMcpCommand(['login', 'local'])
                assert.strictEqual(process.exitCode, 1)
                expect(errors.join('\n')).toContain(
                    'OAuth login only applies to streamable HTTP servers.',
                )
                expect(loginMcpServerOAuth).not.toHaveBeenCalled()
            },
        )
    })
})
