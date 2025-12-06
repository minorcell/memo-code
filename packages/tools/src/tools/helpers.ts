import { normalize, resolve } from "node:path"

/**
 * 生成标准化的绝对路径，避免因工作目录差异导致的路径错误。
 */
export function normalizePath(rawPath: string) {
    return normalize(resolve(rawPath))
}
