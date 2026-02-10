/** @file MCP tool registry */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type { McpTool, ToolRegistry, MCPServerConfig } from '../types'
import { McpClientPool } from './pool'
import { setActiveMcpPool } from './context'

/** MCP tool registry */
export class McpToolRegistry {
    private pool: McpClientPool
    private tools: Map<string, McpTool> = new Map()
    private readonly shouldLog: boolean

    constructor() {
        this.pool = new McpClientPool()
        setActiveMcpPool(this.pool)
        this.shouldLog =
            process.env.MEMO_MCP_LOG === '1' || !(process.stdout.isTTY && process.stdin.isTTY)
    }

    /**
     * Connect and load all configured MCP Servers
     * @param servers - mapping from server names to configurations
     * @returns number of successfully loaded tools
     */
    async loadServers(servers: Record<string, MCPServerConfig> | undefined): Promise<number> {
        if (!servers || Object.keys(servers).length === 0) {
            return 0
        }

        let totalTools = 0

        await Promise.all(
            Object.entries(servers).map(async ([name, config]) => {
                try {
                    const connection = await this.pool.connect(name, config)

                    // Bind execute method for each tool
                    for (const toolInfo of connection.tools) {
                        const tool: McpTool = {
                            ...toolInfo,
                            execute: async (input: unknown): Promise<CallToolResult> => {
                                const client = this.pool.get(toolInfo.serverName)?.client
                                if (!client) {
                                    throw new Error(
                                        `MCP client for server '${toolInfo.serverName}' not found`,
                                    )
                                }
                                return client.callTool({
                                    name: toolInfo.originalName,
                                    arguments: input as Record<string, unknown>,
                                }) as Promise<CallToolResult>
                            },
                        }
                        this.tools.set(tool.name, tool)
                    }

                    totalTools += connection.tools.length
                    if (this.shouldLog) {
                        console.log(
                            `[MCP] Connected to '${name}' with ${connection.tools.length} tools`
                        )
                    }
                } catch (err) {
                    if (this.shouldLog) {
                        console.error(`[MCP] Failed to connect to server '${name}':`, err)
                    }
                }
            }),
        )

        return totalTools
    }

    /** Get tool */
    get(name: string): McpTool | undefined {
        return this.tools.get(name)
    }

    /** Get all tools */
    getAll(): McpTool[] {
        return Array.from(this.tools.values())
    }

    /** Convert to ToolRegistry format */
    toRegistry(): ToolRegistry {
        const registry: ToolRegistry = {}
        for (const [name, tool] of this.tools) {
            registry[name] = tool
        }
        return registry
    }

    /** Check if tool exists */
    has(name: string): boolean {
        return this.tools.has(name)
    }

    /** Get tool count */
    get size(): number {
        return this.tools.size
    }

    /** Close all MCP connections */
    async dispose(): Promise<void> {
        await this.pool.closeAll()
        this.tools.clear()
        setActiveMcpPool(null)
    }

    /** Get internal pool (for testing or advanced usage) */
    getPool(): McpClientPool {
        return this.pool
    }
}
