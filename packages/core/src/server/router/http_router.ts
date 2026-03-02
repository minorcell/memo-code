import type { IncomingMessage, ServerResponse } from 'node:http'

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export type RouteContext = {
    req: IncomingMessage
    res: ServerResponse
    requestId: string
    path: string
    query: URLSearchParams
    params: Record<string, string>
}

export type RouteHandler = (context: RouteContext) => Promise<void> | void

type RouteEntry = {
    method: RouteMethod
    pattern: string
    segments: string[]
    handler: RouteHandler
}

function normalizePath(pathname: string): string {
    if (!pathname || pathname === '/') return '/'
    return pathname.replace(/\/+$/g, '') || '/'
}

function toSegments(pathname: string): string[] {
    const normalized = normalizePath(pathname)
    if (normalized === '/') return []
    return normalized
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
}

function matchPath(pattern: string[], actual: string[]): Record<string, string> | null {
    if (pattern.length !== actual.length) return null

    const params: Record<string, string> = {}
    for (let index = 0; index < pattern.length; index += 1) {
        const expected = pattern[index]
        const value = actual[index]
        if (!expected || !value) return null

        if (expected.startsWith(':')) {
            params[expected.slice(1)] = decodeURIComponent(value)
            continue
        }
        if (expected !== value) {
            return null
        }
    }

    return params
}

export class HttpRouter {
    private readonly routes: RouteEntry[] = []

    register(method: RouteMethod, pattern: string, handler: RouteHandler): void {
        this.routes.push({
            method,
            pattern: normalizePath(pattern),
            segments: toSegments(pattern),
            handler,
        })
    }

    async handle(options: {
        req: IncomingMessage
        res: ServerResponse
        requestId: string
        url: URL
    }): Promise<boolean> {
        const method = (options.req.method || 'GET').toUpperCase() as RouteMethod
        const path = normalizePath(options.url.pathname)
        const pathSegments = toSegments(path)

        for (const route of this.routes) {
            if (route.method !== method) continue
            const params = matchPath(route.segments, pathSegments)
            if (!params) continue

            await route.handler({
                req: options.req,
                res: options.res,
                requestId: options.requestId,
                path,
                query: options.url.searchParams,
                params,
            })
            return true
        }

        return false
    }
}
