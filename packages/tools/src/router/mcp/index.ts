/** @file MCP 工具注册表 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type { McpTool, ToolRegistry, MCPServerConfig } from '../types'
import { McpClientPool } from './pool'
import { setActiveMcpPool } from './context'

/** MCP 工具注册表 */
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
     * 连接并加载所有配置的 MCP Servers
     * @param servers - server 名称到配置的映射
     * @returns 成功加载的工具数量
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

                    // 为每个工具绑定 execute 方法
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
                            `[MCP] Connected to '${name}' with ${connection.tools.length} tools`,
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

    /** 获取工具 */
    get(name: string): McpTool | undefined {
        return this.tools.get(name)
    }

    /** 获取所有工具 */
    getAll(): McpTool[] {
        return Array.from(this.tools.values())
    }

    /** 转换为 ToolRegistry 格式 */
    toRegistry(): ToolRegistry {
        const registry: ToolRegistry = {}
        for (const [name, tool] of this.tools) {
            registry[name] = tool
        }
        return registry
    }

    /** 检查工具是否存在 */
    has(name: string): boolean {
        return this.tools.has(name)
    }

    /** 获取工具数量 */
    get size(): number {
        return this.tools.size
    }

    /** 关闭所有 MCP 连接 */
    async dispose(): Promise<void> {
        await this.pool.closeAll()
        this.tools.clear()
        setActiveMcpPool(null)
    }

    /** 获取内部 pool（用于测试或高级用法） */
    getPool(): McpClientPool {
        return this.pool
    }
}
