import { mkdir } from "node:fs/promises"
import { dirname, normalize, resolve } from "node:path"

/**
 * 确保目标文件的父级目录已存在，若不存在则递归创建。
 */
export async function ensureParentDir(path: string) {
    const dir = dirname(path)
    if (!dir || dir === "." || dir === "/") return
    await mkdir(dir, { recursive: true })
}

/**
 * 生成标准化的绝对路径，避免因工作目录差异导致的路径错误。
 */
export function normalizePath(rawPath: string) {
    return normalize(resolve(rawPath))
}
