import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { CoreAuth } from '@memo/core/server/handler/auth'
import { createWorkspaceState } from '@memo/core/server/handler/workspace'
import { CoreSessionManager } from '@memo/core/server/handler/session_manager'
import { registerCoreApiRoutes } from '@memo/core/server/router/api_routes'
import { HttpRouter } from '@memo/core/server/router/http_router'
import { SseHub } from '@memo/core/server/utils/sse'
import {
    applyCors,
    normalizeError,
    serveStatic,
    writeError,
    writeNoContent,
    type CoreCorsOptions,
} from '@memo/core/server/utils/http'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5494

export type CoreHttpServerOptions = {
    host?: string
    port?: number
    password?: string
    memoHome?: string
    cors?: CoreCorsOptions
    staticDir?: string
    tokenTtlSeconds?: number
}

export type CoreHttpServerHandle = {
    url: string
    openApiSpecPath: string
    close: () => Promise<void>
}

let activeServerHandle: CoreHttpServerHandle | null = null

function normalizeHost(value: string | undefined): string {
    const trimmed = value?.trim()
    return trimmed || DEFAULT_HOST
}

function normalizePort(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_PORT
    if (value === 0) return 0
    if (value < 1 || value > 65535) return DEFAULT_PORT
    return value
}

function resolvePassword(value: string | undefined): string {
    const password = value?.trim() || process.env.MEMO_SERVER_PASSWORD?.trim()
    if (!password) {
        throw new Error('MEMO_SERVER_PASSWORD is required to start core HTTP server')
    }
    return password
}

function formatServerUrl(host: string, port: number): string {
    const safeHost = host.includes(':') ? `[${host}]` : host
    return `http://${safeHost}:${port}`
}

export async function startCoreHttpServer(
    options: CoreHttpServerOptions = {},
): Promise<CoreHttpServerHandle> {
    if (activeServerHandle) {
        await activeServerHandle.close()
        activeServerHandle = null
    }

    const host = normalizeHost(options.host)
    const port = normalizePort(options.port)
    const password = resolvePassword(options.password)
    const auth = new CoreAuth({
        password,
        tokenTtlSeconds: options.tokenTtlSeconds,
    })

    const sseHub = new SseHub()
    const sessionManager = new CoreSessionManager({
        sseHub,
        memoHome: options.memoHome,
    })
    const workspaceState = createWorkspaceState()

    const router = new HttpRouter()
    let serverUrl = formatServerUrl(host, port)

    registerCoreApiRoutes({
        router,
        auth,
        sessionManager,
        sseHub,
        workspaceState,
        getServerUrl: () => serverUrl,
    })

    const server = createServer(async (req, res) => {
        const requestId = randomUUID()
        const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
        applyCors(req, res, options.cors)

        if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
            writeNoContent(res)
            return
        }

        try {
            const handled = await router.handle({ req, res, requestId, url })
            if (handled) return

            if (options.staticDir && !url.pathname.startsWith('/api/')) {
                const served = await serveStatic(options.staticDir, url.pathname, res)
                if (served) return
            }

            writeError(res, requestId, url.pathname, 404, 'NOT_FOUND', 'Route not found')
        } catch (error) {
            const normalized = normalizeError(error)
            writeError(
                res,
                requestId,
                url.pathname,
                normalized.statusCode,
                normalized.code,
                normalized.message,
                normalized.details,
            )
        }
    })

    await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen)
        server.listen({ host, port }, () => {
            server.off('error', rejectListen)
            resolveListen()
        })
    })

    const address = server.address()
    const resolvedPort =
        address && typeof address === 'object' && 'port' in address ? address.port : port
    serverUrl = formatServerUrl(host, resolvedPort)

    const handle: CoreHttpServerHandle = {
        url: serverUrl,
        openApiSpecPath: '/api/openapi.json',
        close: async () => {
            await sessionManager.close()
            sseHub.close()
            await new Promise<void>((resolveClose) => {
                server.close(() => resolveClose())
            })
            if (activeServerHandle === handle) {
                activeServerHandle = null
            }
        },
    }

    activeServerHandle = handle
    return handle
}

export async function stopCoreHttpServer(): Promise<void> {
    if (!activeServerHandle) return
    await activeServerHandle.close()
    activeServerHandle = null
}
