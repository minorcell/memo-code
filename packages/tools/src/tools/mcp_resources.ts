import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { getActiveMcpPool } from '@memo/tools/router/mcp/context'

const LIST_MCP_RESOURCES_INPUT_SCHEMA = z
    .object({
        server: z.string().optional(),
        cursor: z.string().optional(),
    })
    .strict()

const LIST_MCP_RESOURCE_TEMPLATES_INPUT_SCHEMA = z
    .object({
        server: z.string().optional(),
        cursor: z.string().optional(),
    })
    .strict()

const READ_MCP_RESOURCE_INPUT_SCHEMA = z
    .object({
        server: z.string().min(1),
        uri: z.string().min(1),
    })
    .strict()

type ListResourcesInput = z.infer<typeof LIST_MCP_RESOURCES_INPUT_SCHEMA>
type ListResourceTemplatesInput = z.infer<typeof LIST_MCP_RESOURCE_TEMPLATES_INPUT_SCHEMA>
type ReadResourceInput = z.infer<typeof READ_MCP_RESOURCE_INPUT_SCHEMA>
type CacheEntry = {
    expiresAt: number
    value: unknown
}

const LIST_CACHE_TTL_MS = 15_000
const READ_CACHE_TTL_MS = 60_000

const responseCache = new Map<string, CacheEntry>()
const inflightRequests = new Map<string, Promise<unknown>>()

function getPoolOrThrow() {
    const pool = getActiveMcpPool()
    if (!pool) {
        throw new Error('MCP pool is not initialized')
    }
    return pool
}

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message
    }
    return String(err)
}

function getCached<T>(cacheKey: string): T | undefined {
    const now = Date.now()
    const entry = responseCache.get(cacheKey)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
        responseCache.delete(cacheKey)
        return undefined
    }
    return entry.value as T
}

async function withCachedValue<T>(
    cacheKey: string,
    ttlMs: number,
    loadValue: () => Promise<T>,
): Promise<T> {
    const cached = getCached<T>(cacheKey)
    if (cached !== undefined) {
        return cached
    }

    const inflight = inflightRequests.get(cacheKey)
    if (inflight) {
        return (await inflight) as T
    }

    const pending = (async () => {
        const value = await loadValue()
        responseCache.set(cacheKey, {
            value,
            expiresAt: Date.now() + ttlMs,
        })
        return value
    })()

    inflightRequests.set(cacheKey, pending as Promise<unknown>)
    try {
        return await pending
    } finally {
        inflightRequests.delete(cacheKey)
    }
}

function listResourcesCacheKey(server: string, cursor?: string): string {
    return `list_resources:${server}:${cursor ?? ''}`
}

function listResourceTemplatesCacheKey(server: string, cursor?: string): string {
    return `list_resource_templates:${server}:${cursor ?? ''}`
}

function readResourceCacheKey(server: string, uri: string): string {
    return `read_resource:${server}:${uri}`
}

export function __resetMcpResourceCacheForTests() {
    responseCache.clear()
    inflightRequests.clear()
}

export const listMcpResourcesTool = defineMcpTool<ListResourcesInput>({
    name: 'list_mcp_resources',
    description:
        'Lists resources provided by MCP servers. Prefer resources over web search when possible.',
    inputSchema: LIST_MCP_RESOURCES_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async ({ server, cursor }) => {
        try {
            const pool = getPoolOrThrow()
            const serverName = server?.trim()
            if (serverName) {
                const connection = pool.get(serverName)
                if (!connection) {
                    return textResult(`MCP server not found: ${server}`, true)
                }

                const payload = await withCachedValue(
                    listResourcesCacheKey(connection.name, cursor),
                    LIST_CACHE_TTL_MS,
                    async () => {
                        const result = await connection.client.listResources(
                            cursor ? { cursor } : undefined,
                        )
                        return {
                            server: connection.name,
                            resources: result.resources,
                            nextCursor: result.nextCursor,
                        }
                    },
                )
                return textResult(JSON.stringify(payload, null, 2))
            }

            if (cursor) {
                return textResult('cursor is only supported when server is specified', true)
            }

            const connections = pool.getAll().sort((a, b) => a.name.localeCompare(b.name))
            const payload = await withCachedValue(
                listResourcesCacheKey(
                    `all:${connections.map((connection) => connection.name).join(',')}`,
                ),
                LIST_CACHE_TTL_MS,
                async () => {
                    const settled = await Promise.allSettled(
                        connections.map(async (connection) => ({
                            server: connection.name,
                            result: await connection.client.listResources(),
                        })),
                    )

                    const resources: Array<Record<string, unknown>> = []
                    const errors: Array<{ server: string; error: string }> = []

                    settled.forEach((item, index) => {
                        const serverName = connections[index]?.name ?? 'unknown'
                        if (item.status === 'rejected') {
                            errors.push({
                                server: serverName,
                                error: getErrorMessage(item.reason),
                            })
                            return
                        }

                        for (const resource of item.value.result.resources) {
                            resources.push({ server: item.value.server, ...resource })
                        }
                    })

                    return {
                        resources,
                        ...(errors.length > 0 ? { errors } : {}),
                    }
                },
            )

            return textResult(JSON.stringify(payload, null, 2))
        } catch (err) {
            return textResult(`list_mcp_resources failed: ${(err as Error).message}`, true)
        }
    },
})

export const listMcpResourceTemplatesTool = defineMcpTool<ListResourceTemplatesInput>({
    name: 'list_mcp_resource_templates',
    description:
        'Lists resource templates provided by MCP servers. Prefer resource templates over web search when possible.',
    inputSchema: LIST_MCP_RESOURCE_TEMPLATES_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async ({ server, cursor }) => {
        try {
            const pool = getPoolOrThrow()
            const serverName = server?.trim()
            if (serverName) {
                const connection = pool.get(serverName)
                if (!connection) {
                    return textResult(`MCP server not found: ${server}`, true)
                }

                const payload = await withCachedValue(
                    listResourceTemplatesCacheKey(connection.name, cursor),
                    LIST_CACHE_TTL_MS,
                    async () => {
                        const result = await connection.client.listResourceTemplates(
                            cursor ? { cursor } : undefined,
                        )
                        return {
                            server: connection.name,
                            resourceTemplates: result.resourceTemplates,
                            nextCursor: result.nextCursor,
                        }
                    },
                )
                return textResult(JSON.stringify(payload, null, 2))
            }

            if (cursor) {
                return textResult('cursor is only supported when server is specified', true)
            }

            const connections = pool.getAll().sort((a, b) => a.name.localeCompare(b.name))
            const payload = await withCachedValue(
                listResourceTemplatesCacheKey(
                    `all:${connections.map((connection) => connection.name).join(',')}`,
                ),
                LIST_CACHE_TTL_MS,
                async () => {
                    const settled = await Promise.allSettled(
                        connections.map(async (connection) => ({
                            server: connection.name,
                            result: await connection.client.listResourceTemplates(),
                        })),
                    )

                    const resourceTemplates: Array<Record<string, unknown>> = []
                    const errors: Array<{ server: string; error: string }> = []

                    settled.forEach((item, index) => {
                        const serverName = connections[index]?.name ?? 'unknown'
                        if (item.status === 'rejected') {
                            errors.push({
                                server: serverName,
                                error: getErrorMessage(item.reason),
                            })
                            return
                        }

                        for (const template of item.value.result.resourceTemplates) {
                            resourceTemplates.push({ server: item.value.server, ...template })
                        }
                    })

                    return {
                        resourceTemplates,
                        ...(errors.length > 0 ? { errors } : {}),
                    }
                },
            )

            return textResult(JSON.stringify(payload, null, 2))
        } catch (err) {
            return textResult(`list_mcp_resource_templates failed: ${(err as Error).message}`, true)
        }
    },
})

export const readMcpResourceTool = defineMcpTool<ReadResourceInput>({
    name: 'read_mcp_resource',
    description:
        'Read a specific resource from an MCP server given the server name and resource URI.',
    inputSchema: READ_MCP_RESOURCE_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async ({ server, uri }) => {
        try {
            const pool = getPoolOrThrow()
            const serverName = server.trim()
            const connection = pool.get(serverName)
            if (!connection) {
                return textResult(`MCP server not found: ${server}`, true)
            }

            const payload = await withCachedValue(
                readResourceCacheKey(serverName, uri),
                READ_CACHE_TTL_MS,
                async () => {
                    const result = await connection.client.readResource({ uri })
                    return {
                        server: serverName,
                        uri,
                        ...result,
                    }
                },
            )
            return textResult(JSON.stringify(payload, null, 2))
        } catch (err) {
            return textResult(`read_mcp_resource failed: ${(err as Error).message}`, true)
        }
    },
})
