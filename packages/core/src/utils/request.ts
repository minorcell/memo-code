// 简单的请求工具，封装 fetch JSON 读写

/** 请求配置封装，body 可接受字符串或任意对象。 */
export type RequestOptions = {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: unknown
}

/**
 * 发送 JSON 请求并解析响应体。
 * - 当 body 为对象时自动序列化并补充 Content-Type。
 * - 响应非 2xx 时抛出错误，便于上层捕获。
 */
export async function requestJson<T>(options: RequestOptions): Promise<T> {
    const { url, method = "GET", headers = {}, body } = options

    const fetchHeaders: Record<string, string> = { ...headers }
    let payload: any

    if (body !== undefined) {
        if (typeof body === "string") {
            payload = body
        } else {
            payload = JSON.stringify(body)
            if (!fetchHeaders["Content-Type"]) {
                fetchHeaders["Content-Type"] = "application/json"
            }
        }
    }

    const res = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: payload,
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`请求失败: ${res.status} ${text}`)
    }

    return (await res.json()) as T
}
