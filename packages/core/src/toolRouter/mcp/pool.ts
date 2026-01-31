/** @file MCP Client 连接池管理 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { MCPServerConfig, McpClientConnection } from '../types'

type ClientTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

/** 创建标准化的 MCP Client */
function createMcpClient(): Client {
    return new Client(
        {
            name: 'memo-code-cli-client',
            version: '1.0.0',
        },
        {
            capabilities: {
                // 声明客户端支持的能力
                tools: {},
            },
        },
    )
}

/** 构建 HTTP 请求的 headers */
function buildRequestInit(headers?: Record<string, string>): RequestInit | undefined {
    if (!headers || Object.keys(headers).length === 0) return undefined
    return { headers }
}

/** 通过 HTTP 连接 MCP Server */
async function connectOverHttp(
    config: Extract<MCPServerConfig, { url: string }>,
): Promise<{ client: Client; transport: ClientTransport }> {
    const baseUrl = new URL(config.url)
    const requestInit = buildRequestInit(config.headers)

    // SSE 类型强制使用 SSE 传输
    if (config.type === 'sse') {
        const client = createMcpClient()
        const transport = new SSEClientTransport(baseUrl, { requestInit })
        await client.connect(transport)
        return { client, transport }
    }

    // streamable_http 类型，默认尝试 streamable，失败后可回退 SSE
    const allowFallback = config.fallback_to_sse ?? true

    try {
        const client = createMcpClient()
        const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit })
        await client.connect(transport)
        return { client, transport }
    } catch (streamErr) {
        if (!allowFallback) throw streamErr

        try {
            const client = createMcpClient()
            const transport = new SSEClientTransport(baseUrl, { requestInit })
            await client.connect(transport)
            return { client, transport }
        } catch (sseErr) {
            const message = `Failed to connect via streamable_http (${(streamErr as Error).message}); SSE fallback failed (${(sseErr as Error).message})`
            const combined = new Error(message)
            ;(combined as any).cause = { streamErr, sseErr }
            throw combined
        }
    }
}

/** 根据配置建立连接 */
async function connectWithConfig(
    config: MCPServerConfig,
): Promise<{ client: Client; transport: ClientTransport }> {
    if ('url' in config) {
        return connectOverHttp(config)
    }

    // stdio 类型
    const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
    })
    const client = createMcpClient()
    await client.connect(transport)
    return { client, transport }
}

/** MCP Client 连接池 */
export class McpClientPool {
    private connections: Map<string, McpClientConnection> = new Map()

    /**
     * 连接指定的 MCP Server
     * @param name - server 名称（配置中的 key）
     * @param config - server 配置
     * @returns 连接信息（包含 client、transport 和工具列表）
     */
    async connect(name: string, config: MCPServerConfig): Promise<McpClientConnection> {
        // 如果已连接，直接返回
        const existing = this.connections.get(name)
        if (existing) {
            return existing
        }

        // 建立新连接
        const { client, transport } = await connectWithConfig(config)

        // 获取工具列表
        const toolsResult = await client.listTools()

        // 构建 McpTool 数组（暂不填充 execute，由 Registry 处理）
        const connection: McpClientConnection = {
            name,
            client,
            transport,
            tools: (toolsResult.tools || []).map((t) => ({
                name: `${name}_${t.name}`,
                description: t.description || `Tool from ${name}: ${t.name}`,
                source: 'mcp' as const,
                serverName: name,
                originalName: t.name,
                inputSchema: t.inputSchema as any,
                // execute 会在 registry 中绑定
                execute: async () => ({ content: [] }),
            })),
        }

        this.connections.set(name, connection)
        return connection
    }

    /** 获取已连接的 client */
    get(name: string): McpClientConnection | undefined {
        return this.connections.get(name)
    }

    /** 获取所有连接 */
    getAll(): McpClientConnection[] {
        return Array.from(this.connections.values())
    }

    /** 获取所有工具（跨所有 connections） */
    getAllTools() {
        const allTools: {
            name: string
            description: string
            serverName: string
            originalName: string
            inputSchema: any
            client: Client
        }[] = []

        for (const conn of this.connections.values()) {
            for (const tool of conn.tools) {
                allTools.push({
                    name: tool.name,
                    description: tool.description,
                    serverName: tool.serverName,
                    originalName: tool.originalName,
                    inputSchema: tool.inputSchema,
                    client: conn.client,
                })
            }
        }

        return allTools
    }

    /** 关闭所有连接 */
    async closeAll(): Promise<void> {
        const closePromises = Array.from(this.connections.values()).map(async (conn) => {
            try {
                await conn.client.close()
            } catch (err) {
                console.error(`[MCP] Error closing client ${conn.name}:`, err)
            }
        })

        await Promise.all(closePromises)
        this.connections.clear()
    }

    /** 获取连接数量 */
    get size(): number {
        return this.connections.size
    }
}
