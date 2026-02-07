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

function getPoolOrThrow() {
    const pool = getActiveMcpPool()
    if (!pool) {
        throw new Error('MCP pool is not initialized')
    }
    return pool
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
            if (server?.trim()) {
                const connection = pool.get(server.trim())
                if (!connection) {
                    return textResult(`MCP server not found: ${server}`, true)
                }
                const result = await connection.client.listResources(
                    cursor ? { cursor } : undefined,
                )
                return textResult(
                    JSON.stringify(
                        {
                            server: connection.name,
                            resources: result.resources,
                            nextCursor: result.nextCursor,
                        },
                        null,
                        2,
                    ),
                )
            }

            if (cursor) {
                return textResult('cursor is only supported when server is specified', true)
            }

            const connections = pool.getAll().sort((a, b) => a.name.localeCompare(b.name))
            const resources: Array<Record<string, unknown>> = []

            for (const connection of connections) {
                const result = await connection.client.listResources()
                for (const resource of result.resources) {
                    resources.push({ server: connection.name, ...resource })
                }
            }

            return textResult(JSON.stringify({ resources }, null, 2))
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
            if (server?.trim()) {
                const connection = pool.get(server.trim())
                if (!connection) {
                    return textResult(`MCP server not found: ${server}`, true)
                }
                const result = await connection.client.listResourceTemplates(
                    cursor ? { cursor } : undefined,
                )
                return textResult(
                    JSON.stringify(
                        {
                            server: connection.name,
                            resourceTemplates: result.resourceTemplates,
                            nextCursor: result.nextCursor,
                        },
                        null,
                        2,
                    ),
                )
            }

            if (cursor) {
                return textResult('cursor is only supported when server is specified', true)
            }

            const connections = pool.getAll().sort((a, b) => a.name.localeCompare(b.name))
            const resourceTemplates: Array<Record<string, unknown>> = []

            for (const connection of connections) {
                const result = await connection.client.listResourceTemplates()
                for (const template of result.resourceTemplates) {
                    resourceTemplates.push({ server: connection.name, ...template })
                }
            }

            return textResult(JSON.stringify({ resourceTemplates }, null, 2))
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
            const connection = pool.get(server)
            if (!connection) {
                return textResult(`MCP server not found: ${server}`, true)
            }
            const result = await connection.client.readResource({ uri })
            return textResult(
                JSON.stringify(
                    {
                        server,
                        uri,
                        ...result,
                    },
                    null,
                    2,
                ),
            )
        } catch (err) {
            return textResult(`read_mcp_resource failed: ${(err as Error).message}`, true)
        }
    },
})
