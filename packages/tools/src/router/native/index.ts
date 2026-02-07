/** @file 内置工具注册表 */
import type { NativeTool, ToolRegistry } from '../types'

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
