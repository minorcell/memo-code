import assert from 'node:assert'
import { afterEach, describe, test } from 'vitest'
import { setActiveMcpPool } from '@memo/tools/router/mcp/context'
import {
    listMcpResourceTemplatesTool,
    listMcpResourcesTool,
    readMcpResourceTool,
} from '@memo/tools/tools/mcp_resources'

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

afterEach(() => {
    setActiveMcpPool(null)
})

describe('mcp resource tools', () => {
    test('returns error when MCP pool is missing', async () => {
        setActiveMcpPool(null)
        const result = await listMcpResourcesTool.execute({})
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('not initialized'))
    })

    test('lists resources for a specific server with cursor', async () => {
        let capturedCursor: unknown = undefined
        const connection = {
            name: 'alpha',
            client: {
                listResources: async (params?: unknown) => {
                    capturedCursor = params
                    return {
                        resources: [{ uri: 'memo://a', name: 'A' }],
                        nextCursor: 'next-a',
                    }
                },
            },
        }

        const pool = {
            get: (name: string) => (name === 'alpha' ? connection : undefined),
            getAll: () => [connection],
        }
        setActiveMcpPool(pool as any)

        const result = await listMcpResourcesTool.execute({ server: 'alpha', cursor: 'c1' })
        const text = textPayload(result)

        assert.ok(!result.isError)
        assert.deepStrictEqual(capturedCursor, { cursor: 'c1' })
        const parsed = JSON.parse(text)
        assert.strictEqual(parsed.server, 'alpha')
        assert.strictEqual(parsed.nextCursor, 'next-a')
        assert.strictEqual(parsed.resources[0].uri, 'memo://a')
    })

    test('aggregates resources from all servers in sorted order', async () => {
        const pool = {
            get: () => undefined,
            getAll: () => [
                {
                    name: 'zeta',
                    client: {
                        listResources: async () => ({
                            resources: [{ uri: 'memo://z', name: 'Z' }],
                        }),
                    },
                },
                {
                    name: 'alpha',
                    client: {
                        listResources: async () => ({
                            resources: [{ uri: 'memo://a', name: 'A' }],
                        }),
                    },
                },
            ],
        }
        setActiveMcpPool(pool as any)

        const result = await listMcpResourcesTool.execute({})
        const parsed = JSON.parse(textPayload(result))

        assert.strictEqual(parsed.resources[0].server, 'alpha')
        assert.strictEqual(parsed.resources[1].server, 'zeta')
    })

    test('rejects cursor without server in list tools', async () => {
        const pool = {
            get: () => undefined,
            getAll: () => [],
        }
        setActiveMcpPool(pool as any)

        const resourcesResult = await listMcpResourcesTool.execute({ cursor: 'x' })
        assert.strictEqual(resourcesResult.isError, true)

        const templatesResult = await listMcpResourceTemplatesTool.execute({ cursor: 'x' })
        assert.strictEqual(templatesResult.isError, true)
    })

    test('reads resource by server + uri', async () => {
        let capturedUri: unknown
        const connection = {
            name: 'alpha',
            client: {
                readResource: async (params: unknown) => {
                    capturedUri = params
                    return {
                        contents: [{ uri: 'memo://a', text: 'payload' }],
                    }
                },
            },
        }
        const pool = {
            get: (name: string) => (name === 'alpha' ? connection : undefined),
            getAll: () => [connection],
        }
        setActiveMcpPool(pool as any)

        const result = await readMcpResourceTool.execute({ server: 'alpha', uri: 'memo://a' })
        assert.ok(!result.isError)
        assert.deepStrictEqual(capturedUri, { uri: 'memo://a' })
        const parsed = JSON.parse(textPayload(result))
        assert.strictEqual(parsed.server, 'alpha')
        assert.strictEqual(parsed.contents[0].text, 'payload')
    })

    test('returns not found error for missing server', async () => {
        const pool = {
            get: () => undefined,
            getAll: () => [],
        }
        setActiveMcpPool(pool as any)

        const result = await readMcpResourceTool.execute({ server: 'none', uri: 'memo://x' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('MCP server not found'))
    })
})
