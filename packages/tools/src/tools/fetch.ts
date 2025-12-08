import type { ToolFn } from '@memo/tools/tools/types'

/**
 * 发起简单的 HTTP GET 请求，返回状态码、正文长度与正文内容。
 */
export const fetchUrl: ToolFn = async (rawUrl: string) => {
    const url = rawUrl.trim()
    if (!url) return 'fetch 需要 URL'
    try {
        // 直接用 fetch 拉取文本响应
        const res = await globalThis.fetch(url)
        const body = await res.text()
        return `status=${res.status} length=${body.length} body="${body}"`
    } catch (err) {
        return `请求失败: ${(err as Error).message}`
    }
}
