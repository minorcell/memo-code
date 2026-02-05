/** @file ToolRouter 统一类型定义 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'

/** 工具来源类型 */
export type ToolSource = 'native' | 'mcp'

/** JSON Schema 基础类型 */
export interface JSONSchema {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    description?: string
    [key: string]: unknown
}

/** 统一工具接口 */
export interface Tool {
    /** 工具唯一名称（MCP 工具会加上 serverName_ 前缀） */
    name: string
    /** 工具描述 */
    description: string
    /** 工具来源 */
    source: ToolSource
    /** 输入参数的 JSON Schema */
    inputSchema: JSONSchema
    /** 执行工具 */
    execute: (input: unknown) => Promise<CallToolResult>
}

/** 内置工具 */
export interface NativeTool extends Tool {
    source: 'native'
}

/** MCP 外部工具 */
export interface McpTool extends Tool {
    source: 'mcp'
    /** 来源 server 名称 */
    serverName: string
    /** server 端原始工具名 */
    originalName: string
}

/** 工具注册表 */
export type ToolRegistry = Record<string, Tool>

/** 工具描述（用于 Prompt 生成） */
export interface ToolDescription {
    name: string
    description: string
    source: ToolSource
    serverName?: string
    inputSchema: JSONSchema
}

/** MCP Server 配置（复用 config.ts 中的定义） */
export type MCPServerConfig =
    | {
          type?: 'stdio'
          command: string
          args?: string[]
          env?: Record<string, string>
          /** 子进程 stderr 行为（默认在 TTY 中静默）。 */
          stderr?: 'inherit' | 'pipe' | 'ignore'
      }
    | {
          type?: 'streamable_http'
          url: string
          fallback_to_sse?: boolean
          headers?: Record<string, string>
          http_headers?: Record<string, string>
          bearer_token_env_var?: string
      }
    | {
          type: 'sse'
          url: string
          headers?: Record<string, string>
          http_headers?: Record<string, string>
          bearer_token_env_var?: string
      }

/** MCP Client 连接信息 */
export interface McpClientConnection {
    name: string
    client: import('@modelcontextprotocol/sdk/client/index.js').Client
    transport:
        | import('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport
        | import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport
        | import('@modelcontextprotocol/sdk/client/sse.js').SSEClientTransport
    tools: McpTool[]
}
