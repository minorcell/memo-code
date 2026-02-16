import {
    clearAuthTokens,
    ensureValidAccessToken,
    getAuthTokens,
    refreshAuthTokens,
} from '@/api/request'

type RpcRequestFrame = {
    id: string
    type: 'rpc.request'
    method: string
    params?: unknown
}

type RpcResponseFrame =
    | {
          id: string
          type: 'rpc.response'
          ok: true
          data: unknown
      }
    | {
          id: string
          type: 'rpc.response'
          ok: false
          error: {
              code: string
              message: string
              details?: unknown
          }
      }

type EventFrame = {
    type: 'event'
    topic: string
    data: unknown
    seq: number
    ts: string
}

type PendingRequest = {
    frame: RpcRequestFrame
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
    timeoutId: number | null
}

type TopicHandler = (data: unknown, frame: EventFrame) => void

type ReconnectHook = () => void | Promise<void>
type WsRequestOptions = {
    timeoutMs?: number | null
}

const DEFAULT_TIMEOUT_MS = 20_000
const WS_UNAUTHORIZED_CLOSE = 4401

function resolveWsBaseUrl(): string {
    const configured = import.meta.env?.VITE_SERVER_BASE_URL as string | undefined
    if (!configured) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${window.location.host}`
    }

    const url = new URL(configured, window.location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.origin
}

function parseCloseReason(code: number): string {
    if (code === WS_UNAUTHORIZED_CLOSE) return 'Unauthorized websocket session'
    if (code === 4404) return 'Session not found'
    if (code === 4409) return 'Session is occupied by another client'
    return 'WebSocket disconnected'
}

class MemoWsClient {
    private socket: WebSocket | null = null
    private connecting: Promise<void> | null = null
    private reconnectTimer: number | null = null
    private reconnectDelayMs = 1000
    private closedByUser = false

    private readonly pending = new Map<string, PendingRequest>()
    private readonly topicHandlers = new Map<string, Set<TopicHandler>>()
    private readonly reconnectHooks = new Set<ReconnectHook>()

    async request<T = unknown>(
        method: string,
        params?: unknown,
        options?: WsRequestOptions,
    ): Promise<T> {
        await this.ensureConnected()

        const id = crypto.randomUUID()
        const frame: RpcRequestFrame = {
            id,
            type: 'rpc.request',
            method,
            params,
        }
        const timeoutMs =
            options?.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs

        return new Promise<T>((resolve, reject) => {
            const timeoutId =
                typeof timeoutMs === 'number' && timeoutMs > 0
                    ? window.setTimeout(() => {
                          this.pending.delete(id)
                          reject(new Error(`WS RPC timeout: ${method}`))
                      }, timeoutMs)
                    : null

            this.pending.set(id, {
                frame,
                timeoutId,
                resolve: (value) => resolve(value as T),
                reject,
            })

            try {
                this.sendRaw(frame)
            } catch (error) {
                if (timeoutId !== null) window.clearTimeout(timeoutId)
                this.pending.delete(id)
                reject(error)
            }
        })
    }

    subscribe(topic: string, handler: TopicHandler): () => void {
        let set = this.topicHandlers.get(topic)
        if (!set) {
            set = new Set<TopicHandler>()
            this.topicHandlers.set(topic, set)
        }
        set.add(handler)

        void this.ensureConnected().catch(() => {
            // Connection will retry on demand.
        })

        return () => {
            const target = this.topicHandlers.get(topic)
            if (!target) return
            target.delete(handler)
            if (target.size === 0) {
                this.topicHandlers.delete(topic)
            }
        }
    }

    onReconnect(hook: ReconnectHook): () => void {
        this.reconnectHooks.add(hook)
        return () => {
            this.reconnectHooks.delete(hook)
        }
    }

    disconnect(): void {
        this.closedByUser = true
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        if (this.socket) {
            this.socket.close(1000, 'manual disconnect')
            this.socket = null
        }
        this.rejectAllPending('WebSocket disconnected')
    }

    private async ensureConnected(): Promise<void> {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return
        }
        if (this.connecting) {
            return this.connecting
        }
        this.closedByUser = false

        this.connecting = this.connect()
        try {
            await this.connecting
        } finally {
            this.connecting = null
        }
    }

    private async connect(): Promise<void> {
        const tokens = (await ensureValidAccessToken()) ?? getAuthTokens()
        const accessToken = tokens?.accessToken?.trim()
        if (!accessToken) {
            throw new Error('Missing access token')
        }

        const base = resolveWsBaseUrl()
        const wsUrl = `${base}/api/ws?accessToken=${encodeURIComponent(accessToken)}`

        await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(wsUrl)
            let opened = false

            socket.onopen = () => {
                opened = true
                this.socket = socket
                this.reconnectDelayMs = 1000
                resolve()
                void this.runReconnectHooks()
            }

            socket.onmessage = (event) => {
                this.handleMessage(event.data)
            }

            socket.onerror = () => {
                if (!opened) {
                    reject(new Error('WebSocket connection failed'))
                }
            }

            socket.onclose = (event) => {
                if (this.socket === socket) {
                    this.socket = null
                }

                const reason = parseCloseReason(event.code)
                this.rejectAllPending(reason)

                if (!opened) {
                    if (event.code === WS_UNAUTHORIZED_CLOSE) {
                        void this.handleUnauthorizedClose()
                    }
                    reject(new Error(reason))
                    return
                }

                if (this.closedByUser) return

                if (event.code === WS_UNAUTHORIZED_CLOSE) {
                    void this.handleUnauthorizedClose()
                    return
                }

                this.scheduleReconnect()
            }
        })
    }

    private async runReconnectHooks(): Promise<void> {
        for (const hook of this.reconnectHooks) {
            try {
                await hook()
            } catch {
                // Avoid breaking connection on hook failures.
            }
        }
    }

    private async handleUnauthorizedClose(): Promise<void> {
        try {
            const refreshed = await refreshAuthTokens()
            if (!refreshed?.accessToken) {
                clearAuthTokens()
                return
            }
            this.scheduleReconnect(0)
        } catch {
            clearAuthTokens()
        }
    }

    private scheduleReconnect(delayMs?: number): void {
        if (this.closedByUser) return
        if (this.reconnectTimer !== null) return

        const waitMs = typeof delayMs === 'number' ? delayMs : this.reconnectDelayMs

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            void this.ensureConnected().catch(() => {
                this.reconnectDelayMs = Math.min(10_000, Math.floor(this.reconnectDelayMs * 1.8))
                this.scheduleReconnect()
            })
        }, waitMs)
    }

    private handleMessage(raw: unknown): void {
        let parsed: RpcResponseFrame | EventFrame
        try {
            parsed = JSON.parse(String(raw)) as RpcResponseFrame | EventFrame
        } catch {
            return
        }

        if (parsed.type === 'rpc.response') {
            const pending = this.pending.get(parsed.id)
            if (!pending) return

            this.pending.delete(parsed.id)
            if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)

            if (parsed.ok) {
                pending.resolve(parsed.data)
                return
            }

            const message = parsed.error.message || 'WS RPC failed'
            const error = new Error(message)
            ;(error as Error & { code?: string; details?: unknown }).code = parsed.error.code
            ;(error as Error & { code?: string; details?: unknown }).details = parsed.error.details
            pending.reject(error)
            return
        }

        if (parsed.type === 'event') {
            this.emitTopic(parsed.topic, parsed.data, parsed)
        }
    }

    private emitTopic(topic: string, data: unknown, frame: EventFrame): void {
        const exact = this.topicHandlers.get(topic)
        if (exact) {
            for (const handler of exact) {
                handler(data, frame)
            }
        }

        const wildcard = this.topicHandlers.get('*')
        if (wildcard) {
            for (const handler of wildcard) {
                handler(data, frame)
            }
        }
    }

    private sendRaw(frame: RpcRequestFrame): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected')
        }
        this.socket.send(JSON.stringify(frame))
    }

    private rejectAllPending(message: string): void {
        for (const [id, pending] of this.pending.entries()) {
            if (pending.timeoutId !== null) window.clearTimeout(pending.timeoutId)
            pending.reject(new Error(message))
            this.pending.delete(id)
        }
    }
}

const client = new MemoWsClient()

export function wsRequest<T = unknown>(
    method: string,
    params?: unknown,
    options?: WsRequestOptions,
): Promise<T> {
    return client.request<T>(method, params, options)
}

export function wsSubscribe(topic: string, handler: TopicHandler): () => void {
    return client.subscribe(topic, handler)
}

export function onWsReconnect(hook: ReconnectHook): () => void {
    return client.onReconnect(hook)
}

export function disconnectWs(): void {
    client.disconnect()
}
