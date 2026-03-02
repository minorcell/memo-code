import { randomUUID } from 'node:crypto'
import {
    startCoreHttpServer,
    type ChatMessage,
    type CoreHttpServerHandle,
    type LiveSessionState,
    type SseEventEnvelope,
    type ToolPermissionMode,
} from '@memo/core'

type ApiEnvelope<T> =
    | { success: true; data: T; meta: { requestId: string; timestamp: string } }
    | {
          success: false
          error: { code: string; message: string; details?: unknown }
          meta: { requestId: string; timestamp: string; path?: string }
      }

type CreateSessionRequest = {
    sessionId?: string
    providerName?: string
    cwd?: string
    toolPermissionMode?: ToolPermissionMode
    activeMcpServers?: string[]
}

type SubmitMessageResult = {
    accepted: boolean
    queueId: string
    queued: number
}

type CompactSessionResult = {
    reason: string
    status: string
    beforeTokens: number
    afterTokens: number
    thresholdTokens: number
    reductionPercent: number
    summary?: string
    errorMessage?: string
    keptMessages: number
}

type TurnFinalEvent = {
    turn: number
    step?: number
    finalText: string
    status: string
    errorMessage?: string
    turnUsage?: {
        prompt: number
        completion: number
        total: number
    }
    tokenUsage?: {
        prompt: number
        completion: number
        total: number
    }
}

type ApprovalDecision = 'once' | 'session' | 'deny'

function resolveMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error || 'unknown error')
}

function assertSuccessEnvelope<T>(payload: unknown): T {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid API response: expected object')
    }
    const envelope = payload as ApiEnvelope<T>
    if (envelope.success !== true) {
        const message =
            (envelope as ApiEnvelope<T> & { error?: { message?: string } }).error?.message ||
            'API request failed'
        throw new Error(message)
    }
    return envelope.data
}

function parseSseFrame(frame: string): SseEventEnvelope | null {
    let event: string | undefined
    const dataLines: string[] = []

    for (const rawLine of frame.split('\n')) {
        const line = rawLine.trimEnd()
        if (!line || line.startsWith(':')) continue

        const delimiter = line.indexOf(':')
        const field = delimiter >= 0 ? line.slice(0, delimiter) : line
        const value = delimiter >= 0 ? line.slice(delimiter + 1).trimStart() : ''

        if (field === 'event') {
            event = value
            continue
        }
        if (field === 'data') {
            dataLines.push(value)
        }
    }

    if (dataLines.length === 0) return null
    const rawData = dataLines.join('\n')
    let parsed: unknown
    try {
        parsed = JSON.parse(rawData)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null

    const envelope = parsed as SseEventEnvelope
    if (!envelope.event && event) {
        envelope.event = event
    }
    if (typeof envelope.event !== 'string') return null
    return envelope
}

async function decodeSseStream(
    stream: ReadableStream<Uint8Array>,
    onEvent: (event: SseEventEnvelope) => Promise<void> | void,
): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            buffer = buffer.replace(/\r\n/g, '\n')

            let separator = buffer.indexOf('\n\n')
            while (separator >= 0) {
                const frame = buffer.slice(0, separator)
                buffer = buffer.slice(separator + 2)
                separator = buffer.indexOf('\n\n')

                const parsed = parseSseFrame(frame)
                if (!parsed) continue
                await onEvent(parsed)
            }
        }
    } finally {
        reader.releaseLock()
    }
}

export class CoreServerClient {
    constructor(
        readonly baseUrl: string,
        private readonly accessToken: string,
    ) {}

    static async fromPassword(baseUrl: string, password: string): Promise<CoreServerClient> {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ password }),
        })
        if (!response.ok) {
            throw new Error(`Login failed (${response.status})`)
        }
        const payload = assertSuccessEnvelope<{ accessToken: string }>(await response.json())
        return new CoreServerClient(baseUrl, payload.accessToken)
    }

    async createSession(input: CreateSessionRequest): Promise<LiveSessionState> {
        return this.postJson<LiveSessionState>('/api/chat/sessions', input)
    }

    async restoreHistory(
        sessionId: string,
        messages: ChatMessage[],
    ): Promise<{ restored: boolean; messages: number }> {
        return this.postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/history`, {
            messages,
        })
    }

    async submitMessage(sessionId: string, input: string): Promise<SubmitMessageResult> {
        return this.postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
            input,
        })
    }

    async respondApproval(
        sessionId: string,
        fingerprint: string,
        decision: ApprovalDecision,
    ): Promise<{ recorded: boolean }> {
        return this.postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/approval`, {
            fingerprint,
            decision,
        })
    }

    async closeSession(sessionId: string): Promise<{ removed: boolean }> {
        return this.deleteJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}`)
    }

    async getSession(sessionId: string): Promise<LiveSessionState> {
        return this.getJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}`)
    }

    async cancelTurn(sessionId: string): Promise<{ cancelled: boolean }> {
        return this.postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/cancel`, {})
    }

    async compactSession(sessionId: string): Promise<CompactSessionResult> {
        return this.postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/compact`, {})
    }

    subscribeSessionEvents(
        sessionId: string,
        onEvent: (event: SseEventEnvelope) => Promise<void> | void,
    ): { close: () => void; done: Promise<void> } {
        const controller = new AbortController()
        const done = (async () => {
            const response = await fetch(
                `${this.baseUrl}/api/chat/sessions/${encodeURIComponent(sessionId)}/events`,
                {
                    method: 'GET',
                    headers: this.authHeaders(),
                    signal: controller.signal,
                },
            )
            if (!response.ok) {
                throw new Error(`SSE subscribe failed (${response.status})`)
            }
            if (!response.body) {
                throw new Error('SSE stream body is empty')
            }
            await decodeSseStream(response.body, onEvent)
        })().catch((error) => {
            if (controller.signal.aborted) return
            throw error
        })

        return {
            close: () => controller.abort(),
            done,
        }
    }

    private async postJson<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                ...this.authHeaders(),
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            throw new Error(`${path} failed (${response.status})`)
        }
        return assertSuccessEnvelope<T>(await response.json())
    }

    private async getJson<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.authHeaders(),
        })
        if (!response.ok) {
            throw new Error(`${path} failed (${response.status})`)
        }
        return assertSuccessEnvelope<T>(await response.json())
    }

    private async deleteJson<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: this.authHeaders(),
        })
        if (!response.ok) {
            throw new Error(`${path} failed (${response.status})`)
        }
        return assertSuccessEnvelope<T>(await response.json())
    }

    private authHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.accessToken}`,
        }
    }
}

export async function createEmbeddedCoreServerClient(options?: {
    host?: string
    memoHome?: string
    password?: string
}): Promise<{
    client: CoreServerClient
    server: CoreHttpServerHandle
    close: () => Promise<void>
}> {
    const password = options?.password?.trim() || `memo-${randomUUID()}`
    const server = await startCoreHttpServer({
        host: options?.host || '127.0.0.1',
        port: 0,
        password,
        memoHome: options?.memoHome,
    })

    try {
        const client = await CoreServerClient.fromPassword(server.url, password)
        return {
            client,
            server,
            close: async () => {
                await server.close()
            },
        }
    } catch (error) {
        await server.close()
        throw new Error(`Failed to initialize core server client: ${resolveMessage(error)}`)
    }
}

export type { TurnFinalEvent }
