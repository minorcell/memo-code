import { z } from 'zod'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
type SerializedCacheFile = {
    version: 1
    entries: Record<string, CacheEntry>
}

const LIST_CACHE_TTL_MS = 15_000
const READ_CACHE_TTL_MS = 60_000
const CACHE_FILE_NAME = 'mcp.json'
const CACHE_SCHEMA_VERSION = 1
const CACHE_PERSIST_DEBOUNCE_MS = 120

const responseCache = new Map<string, CacheEntry>()
const inflightRequests = new Map<string, Promise<unknown>>()
let cacheLoaded = false
let loadCachePromise: Promise<void> | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistRunning = false
let persistRequested = false

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

function isDiskCacheEnabled() {
    return process.env.VITEST !== '1' && process.env.NODE_ENV !== 'test'
}

function expandHomePath(value: string): string {
    if (value === '~') return homedir()
    if (value.startsWith('~/')) {
        return join(homedir(), value.slice(2))
    }
    return value
}

function resolveMemoHomeDir(): string {
    const configured = process.env.MEMO_HOME?.trim()
    if (configured) {
        return expandHomePath(configured)
    }
    return join(homedir(), '.memo')
}

function getCacheFilePath(): string {
    return join(resolveMemoHomeDir(), 'cache', CACHE_FILE_NAME)
}

function pruneExpiredEntries() {
    const now = Date.now()
    for (const [key, entry] of responseCache.entries()) {
        if (entry.expiresAt <= now) {
            responseCache.delete(key)
        }
    }
}

async function ensureDiskCacheLoaded(): Promise<void> {
    if (!isDiskCacheEnabled()) return
    if (cacheLoaded) return
    if (loadCachePromise) {
        await loadCachePromise
        return
    }

    loadCachePromise = (async () => {
        const cacheFilePath = getCacheFilePath()
        try {
            const raw = await readFile(cacheFilePath, 'utf8')
            const parsed = JSON.parse(raw) as SerializedCacheFile
            if (parsed.version !== CACHE_SCHEMA_VERSION || !parsed.entries) {
                return
            }

            for (const [key, value] of Object.entries(parsed.entries)) {
                if (
                    value &&
                    typeof value === 'object' &&
                    typeof value.expiresAt === 'number' &&
                    'value' in value
                ) {
                    responseCache.set(key, {
                        expiresAt: value.expiresAt,
                        value: value.value,
                    })
                }
            }
            pruneExpiredEntries()
        } catch {
            // Ignore missing/invalid cache file.
        } finally {
            cacheLoaded = true
        }
    })()

    await loadCachePromise
}

function getCached<T>(cacheKey: string): T | undefined {
    const entry = responseCache.get(cacheKey)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
        responseCache.delete(cacheKey)
        return undefined
    }
    return entry.value as T
}

async function persistCacheToDisk(): Promise<void> {
    if (!isDiskCacheEnabled()) return
    pruneExpiredEntries()
    const cacheFilePath = getCacheFilePath()
    const payload: SerializedCacheFile = {
        version: CACHE_SCHEMA_VERSION,
        entries: Object.fromEntries(responseCache.entries()),
    }

    const cacheDir = dirname(cacheFilePath)
    const tempPath = `${cacheFilePath}.tmp`
    await mkdir(cacheDir, { recursive: true })
    await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8')
    await rename(tempPath, cacheFilePath)
}

async function flushPersistQueue(): Promise<void> {
    if (!persistRequested || persistRunning) {
        return
    }

    persistRequested = false
    persistRunning = true
    try {
        await persistCacheToDisk()
    } catch {
        // Ignore cache persistence errors.
    } finally {
        persistRunning = false
        if (persistRequested) {
            void flushPersistQueue()
        }
    }
}

function schedulePersistCache() {
    if (!isDiskCacheEnabled()) return
    persistRequested = true
    if (persistTimer) return
    persistTimer = setTimeout(() => {
        persistTimer = null
        void flushPersistQueue()
    }, CACHE_PERSIST_DEBOUNCE_MS)
    persistTimer.unref?.()
}

async function withCachedValue<T>(
    cacheKey: string,
    ttlMs: number,
    loadValue: () => Promise<T>,
): Promise<T> {
    await ensureDiskCacheLoaded()
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
        schedulePersistCache()
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
    cacheLoaded = false
    loadCachePromise = null
    persistRequested = false
    persistRunning = false
    if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
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
