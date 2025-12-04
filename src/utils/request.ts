// 简单的请求工具，封装 fetch JSON 读写

export type RequestOptions = {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: unknown
}

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
