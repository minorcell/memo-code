import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type { NativeTool } from '@memo/tools/router/types'
import type { ZodTypeAny } from 'zod'

// 工具相关的类型声明

/** 工具名称枚举，作为 Agent action 中的 tool 字段。 */
/** 工具名称（字符串），支持内置与动态扩展工具。 */
export type ToolName = string

/** 统一工具定义（与路由层 Tool 格式一致）。 */
export type McpTool = NativeTool

/** 基于 zod schema 定义工具，输出统一的 MCP/Router 工具格式。 */
export function defineMcpTool<Input>(tool: {
    name: ToolName
    description: string
    inputSchema: ZodTypeAny
    execute: (input: Input) => Promise<CallToolResult>
}): McpTool {
    const { inputSchema, execute, ...rest } = tool
    const jsonSchema = (inputSchema as any).toJSONSchema?.()
    const { $schema, ...inputSchemaJson } =
        (jsonSchema as Record<string, unknown> & { $schema?: string }) ?? {}

    return {
        ...rest,
        source: 'native',
        inputSchema: inputSchemaJson,
        validateInput: (input: unknown) => {
            const parsed = inputSchema.safeParse(input)
            if (!parsed.success) {
                const detail = parsed.error.issues[0]?.message ?? 'invalid input'
                return { ok: false, error: `${tool.name} invalid input: ${detail}` }
            }
            return { ok: true, data: parsed.data }
        },
        execute: execute as (input: unknown) => Promise<CallToolResult>,
    }
}
