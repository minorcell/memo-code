/** @file 内置工具注册表 */
import type { NativeTool, ToolRegistry, JSONSchema } from '../types'
import type { ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/** 从 zod schema 转换为 JSON Schema */
function convertZodToJSONSchema(zodSchema: ZodTypeAny): JSONSchema {
    const jsonSchema = zodToJsonSchema(zodSchema, { target: 'jsonSchema7' })
    // 移除 $schema 等额外字段，保持简洁
    const { $schema, ...rest } = jsonSchema as JSONSchema & { $schema?: string }
    return rest
}

/** 内置工具注册表 */
export class NativeToolRegistry {
    private tools: Map<string, NativeTool> = new Map()

    /** 注册单个工具 */
    register(tool: NativeTool): void {
        this.tools.set(tool.name, tool)
    }

    /** 批量注册工具 */
    registerMany(tools: NativeTool[]): void {
        for (const tool of tools) {
            this.register(tool)
        }
    }

    /** 获取工具 */
    get(name: string): NativeTool | undefined {
        return this.tools.get(name)
    }

    /** 获取所有工具 */
    getAll(): NativeTool[] {
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
}

/** 从现有的工具模块创建 NativeTool */
export function createNativeTool(
    name: string,
    description: string,
    inputSchema: ZodTypeAny,
    execute: (input: unknown) => Promise<import('@modelcontextprotocol/sdk/types').CallToolResult>,
): NativeTool {
    return {
        name,
        description,
        source: 'native',
        inputSchema: convertZodToJSONSchema(inputSchema),
        execute,
    }
}

export { zodToJsonSchema }
