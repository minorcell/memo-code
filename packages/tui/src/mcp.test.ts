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

    test('list text output includes auth_status and falls back on status lookup errors', async () => {
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
                    if ('url' in config) {
                        throw new Error('status failed')
                    }
                    return 'unsupported'
                })

                await runMcpCommand(['list'])

                const text = logs.join('\n')
                expect(text).toContain('MCP servers (2):')
                expect(text).toContain('local')
                expect(text).toContain('remote')
                expect(text).toContain('auth_status: unsupported')
            },
        )
    })

    test('login validates scope arguments', async () => {
        await withMemoHome(baseConfig(), async () => {
            const { errors } = captureConsole()

            await runMcpCommand(['login', '--scopes'])

            assert.strictEqual(process.exitCode, 1)
            expect(errors.join('\n')).toContain('Missing value for --scopes.')
        })
    })

    test('login prints OAuth URL and reports errors', async () => {
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
                const { logs, errors } = captureConsole()
                vi.mocked(loginMcpServerOAuth).mockImplementation(async (options) => {
                    options.onAuthorizationUrl?.('https://example.com/oauth/authorize')
                    options.onBrowserOpenFailure?.(new Error('open failed'), 'https://example.com')
                    throw new Error('oauth failed')
                })

                await runMcpCommand(['login', 'remote'])

                expect(logs.join('\n')).toContain('Starting OAuth login for "remote"...')
                expect(logs.join('\n')).toContain(
                    'Open this URL to authorize:\nhttps://example.com/oauth/authorize',
                )
                expect(logs.join('\n')).toContain(
                    'Browser launch failed. Open the URL above manually.',
                )
                expect(errors.join('\n')).toContain('oauth failed')
                assert.strictEqual(process.exitCode, 1)
            },
        )
    })

    test('logout prints not found message when nothing is removed', async () => {
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
                    removed: false,
                })

                await runMcpCommand(['logout', 'remote'])

                expect(logs.join('\n')).toContain('No OAuth credentials stored for "remote".')
            },
        )
    })

    test('logout handles unknown and non-http servers', async () => {
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

                await runMcpCommand(['logout', 'missing'])
                assert.strictEqual(process.exitCode, 1)
                expect(errors.join('\n')).toContain('Unknown MCP server "missing".')

                process.exitCode = undefined
                await runMcpCommand(['logout', 'local'])
                assert.strictEqual(process.exitCode, 1)
                expect(errors.join('\n')).toContain(
                    'OAuth logout only applies to streamable HTTP servers.',
                )
            },
        )
    })

    test('logout surfaces provider errors', async () => {
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
                const { errors } = captureConsole()
                vi.mocked(logoutMcpServerOAuth).mockRejectedValue(new Error('logout failed'))

                await runMcpCommand(['logout', 'remote'])

                assert.strictEqual(process.exitCode, 1)
                expect(errors.join('\n')).toContain('logout failed')
            },
        )
    })
})
