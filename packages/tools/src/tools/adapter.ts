/** @file 工具适配器 - 将现有工具转换为 ToolRouter 兼容格式 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Tool, JSONSchema } from '@memo/core/toolRouter/types'
import type { McpTool as LegacyMcpTool } from './types'

/** 从 zod schema 转换为 JSON Schema */
export function convertZodToJSONSchema(zodSchema: object): JSONSchema {
    const jsonSchema = zodToJsonSchema(zodSchema as any, { target: 'jsonSchema7' })
    // 移除 $schema 等额外字段
    const { $schema, ...rest } = jsonSchema as JSONSchema & { $schema?: string }
    return rest
}

/** 将现有的 McpTool 转换为新的 Tool 格式 */
export function adaptTool(legacyTool: LegacyMcpTool): Tool {
    return {
        name: legacyTool.name,
        description: legacyTool.description,
        source: 'native',
        inputSchema: convertZodToJSONSchema(legacyTool.inputSchema),
        execute: legacyTool.execute as (input: unknown) => Promise<CallToolResult>,
    }
}

/** 批量转换工具 */
export function adaptTools(legacyTools: LegacyMcpTool[]): Tool[] {
    return legacyTools.map(adaptTool)
}
