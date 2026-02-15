import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { MCPServerConfig } from '../types'
import {
    deleteMcpOAuthCredential,
    getMcpAuthStatus,
    getMcpOAuthCredential,
    setMcpOAuthCredential,
    supportsOAuthLogin,
} from './oauth'

const TEST_URL = 'https://example.com/mcp'

async function withTempMemoHome(run: (home: string) => Promise<void>) {
    const home = await mkdtemp(join(tmpdir(), 'memo-mcp-oauth-'))
    try {
        await run(home)
    } finally {
        await rm(home, { recursive: true, force: true })
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('mcp oauth credential storage', () => {
    test('stores and removes credentials in file mode', async () => {
        await withTempMemoHome(async (home) => {
            const write = await setMcpOAuthCredential(
                TEST_URL,
                {
                    tokens: {
                        access_token: 'token-1',
                        token_type: 'Bearer',
                    },
                },
                {
                    memoHome: home,
                    storeMode: 'file',
                },
            )
            assert.strictEqual(write.backend, 'file')

            const loaded = await getMcpOAuthCredential(TEST_URL, {
                memoHome: home,
                storeMode: 'file',
            })
            assert.strictEqual(loaded.backend, 'file')
            assert.strictEqual(loaded.credential?.tokens?.access_token, 'token-1')

            const deleted = await deleteMcpOAuthCredential(TEST_URL, {
                memoHome: home,
                storeMode: 'file',
            })
            assert.strictEqual(deleted.removed, true)

            const after = await getMcpOAuthCredential(TEST_URL, {
                memoHome: home,
                storeMode: 'file',
            })
            assert.strictEqual(after.credential, undefined)
        })
    })
})

describe('mcp auth status', () => {
    test('returns unsupported for stdio config', async () => {
        const status = await getMcpAuthStatus(
            {
                command: 'node',
                args: ['server.js'],
            },
            {},
        )
        assert.strictEqual(status, 'unsupported')
    })

    test('returns bearer_token when bearer env var is configured', async () => {
        const status = await getMcpAuthStatus({
            type: 'streamable_http',
            url: TEST_URL,
            bearer_token_env_var: 'MCP_TOKEN',
        })
        assert.strictEqual(status, 'bearer_token')
    })

    test('returns oauth when stored token exists', async () => {
        await withTempMemoHome(async (home) => {
            await setMcpOAuthCredential(
                TEST_URL,
                {
                    tokens: {
                        access_token: 'token-2',
                        token_type: 'Bearer',
                    },
                },
                {
                    memoHome: home,
                    storeMode: 'file',
                },
            )

            const status = await getMcpAuthStatus(
                {
                    type: 'streamable_http',
                    url: TEST_URL,
                },
                {
                    memoHome: home,
                    storeMode: 'file',
                },
            )
            assert.strictEqual(status, 'oauth')
        })
    })

    test('returns not_logged_in when oauth metadata is discoverable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                return new Response(
                    JSON.stringify({
                        authorization_endpoint: 'https://example.com/oauth/authorize',
                        token_endpoint: 'https://example.com/oauth/token',
                    }),
                    {
                        status: 200,
                        headers: {
                            'content-type': 'application/json',
                        },
                    },
                )
            }),
        )

        const status = await getMcpAuthStatus({
            type: 'streamable_http',
            url: TEST_URL,
        })
        assert.strictEqual(status, 'not_logged_in')
        expect(fetch).toHaveBeenCalled()
    })

    test('returns unsupported when oauth metadata is not discoverable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                return new Response('not found', { status: 404 })
            }),
        )

        const supported = await supportsOAuthLogin(TEST_URL)
        assert.strictEqual(supported, false)

        const status = await getMcpAuthStatus({
            type: 'streamable_http',
            url: TEST_URL,
        })
        assert.strictEqual(status, 'unsupported')
        expect(fetch).toHaveBeenCalled()
    })
})
