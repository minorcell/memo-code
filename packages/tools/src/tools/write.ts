import { writeFile } from "node:fs/promises"
import type { ToolFn } from "@memo/tools/tools/types"
import { ensureParentDir, normalizePath } from "@memo/tools/tools/helpers"

type WriteInput =
    | { file_path?: string; content?: string }
    | { error: string }

/** 解析 write 入参，确保路径和内容存在。 */
function parseWriteInput(input: string): WriteInput {
    try {
        const parsed = JSON.parse(input)
        if (!parsed?.file_path || typeof parsed.file_path !== "string") {
            return { error: "write 需要 file_path 字符串" }
        }
        if (parsed.content === undefined) {
            return { error: "write 需要 content 字符串" }
        }
        return parsed as WriteInput
    } catch {
        return {
            error:
                'write 参数需为 JSON，如 {"file_path":"/abs/file","content":"..."}',
        }
    }
}

/**
 * 覆盖写入文件内容，必要时递归创建父目录。
 */
export const write: ToolFn = async (rawInput: string) => {
    const parsed = parseWriteInput(rawInput.trim())
    if ("error" in parsed) return parsed.error

    const path = normalizePath(parsed.file_path!)
    const content = String(parsed.content ?? "")
    try {
        // 如有需要递归创建父目录
        await ensureParentDir(path)
        await writeFile(path, content, { encoding: "utf8" })
        return `已写入 ${path} (overwrite, length=${content.length})`
    } catch (err) {
        return `写入失败: ${(err as Error).message}`
    }
}
