import type {
    ApiEnvelope,
    ChatMessage,
    ConfigSnapshot,
    FileSuggestion,
    LiveSessionState,
    McpServerRecord,
    ProviderConfig,
    SessionDetail,
    SessionListResponse,
    SseEventEnvelope,
    ToolPermissionMode,
    UpdateConfigRequest,
} from './api_types'
import { ensureCoreServerProcess } from './core_server_process'

type CoreHttpServerHandle = {
    url: string
    openApiSpecPath: string
    close: () => Promise<void>
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

type ApprovalDecision = 'once' | 'session' | 'deny'

export type ListSessionsQuery = {
    page?: number
    pageSize?: number
    sortBy?: 'updatedAt' | 'startedAt' | 'project' | 'title'
    order?: 'asc' | 'desc'
    project?: string
    workspaceCwd?: string
    dateFrom?: string
    dateTo?: string
    q?: string
}

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

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
        return `${fallback} (${response.status})`
    }
    try {
        const payload = (await response.json()) as ApiEnvelope<unknown>
        if (payload && typeof payload === 'object' && payload.success === false && payload.error) {
            return payload.error.message || `${fallback} (${response.status})`
        }
    } catch {
        // Ignore invalid JSON response.
    }
    return `${fallback} (${response.status})`
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
            throw new Error(await readErrorMessage(response, 'Login failed'))
        }
        const payload = assertSuccessEnvelope<{ accessToken: string }>(await response.json())
        return new CoreServerClient(baseUrl, payload.accessToken)
    }

    async getConfig(): Promise<ConfigSnapshot> {
        return this.getJson('/api/config')
    }

    async patchConfig(input: UpdateConfigRequest): Promise<ConfigSnapshot> {
        return this.patchJson('/api/config', input)
    }

    async listProviders(): Promise<{ items: ProviderConfig[] }> {
        return this.getJson('/api/chat/sessions/providers')
    }

    async createSession(input: CreateSessionRequest): Promise<LiveSessionState> {
        return this.postJson('/api/chat/sessions', input)
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

    async suggestFiles(input: {
        query: string
        sessionId?: string
        workspaceCwd?: string
        limit?: number
        maxDepth?: number
        maxEntries?: number
        respectGitIgnore?: boolean
        ignoreGlobs?: string[]
    }): Promise<{ items: FileSuggestion[] }> {
        return this.postJson('/api/chat/files/suggest', input)
    }

    async listSessions(query: ListSessionsQuery = {}): Promise<SessionListResponse> {
        const searchParams = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue
            searchParams.set(key, String(value))
        }
        const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : ''
        return this.getJson(`/api/sessions${suffix}`)
    }

    async getSessionDetail(sessionId: string): Promise<SessionDetail> {
        return this.getJson(`/api/sessions/${encodeURIComponent(sessionId)}`)
    }

    async listMcpServers(): Promise<{ items: McpServerRecord[] }> {
        return this.getJson('/api/mcp/servers')
    }

    async getMcpServer(name: string): Promise<McpServerRecord> {
        return this.getJson(`/api/mcp/servers/${encodeURIComponent(name)}`)
    }

    async createMcpServer(name: string, config: unknown): Promise<{ created: true }> {
        return this.postJson('/api/mcp/servers', { name, config })
    }

    async updateMcpServer(name: string, config: unknown): Promise<{ updated: true }> {
        return this.putJson(`/api/mcp/servers/${encodeURIComponent(name)}`, { config })
    }

    async removeMcpServer(name: string): Promise<{ deleted: true }> {
        return this.deleteJson(`/api/mcp/servers/${encodeURIComponent(name)}`)
    }

    async loginMcpServer(name: string, scopes?: string[]): Promise<{ loggedIn: true }> {
        return this.postJson(`/api/mcp/servers/${encodeURIComponent(name)}/login`, { scopes })
    }

    async logoutMcpServer(name: string): Promise<{ loggedOut: true }> {
        return this.postJson(`/api/mcp/servers/${encodeURIComponent(name)}/logout`, {})
    }

    async setActiveMcpServers(names: string[]): Promise<{ active: string[] }> {
        return this.postJson('/api/mcp/active', { names })
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
                throw new Error(await readErrorMessage(response, 'SSE subscribe failed'))
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
            throw new Error(await readErrorMessage(response, `${path} failed`))
        }
        return assertSuccessEnvelope(await response.json())
    }

    private async putJson<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'PUT',
            headers: {
                ...this.authHeaders(),
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, `${path} failed`))
        }
        return assertSuccessEnvelope(await response.json())
    }

    private async patchJson<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'PATCH',
            headers: {
                ...this.authHeaders(),
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, `${path} failed`))
        }
        return assertSuccessEnvelope(await response.json())
    }

    private async getJson<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.authHeaders(),
        })
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, `${path} failed`))
        }
        return assertSuccessEnvelope(await response.json())
    }

    private async deleteJson<T>(path: string): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: this.authHeaders(),
        })
        if (!response.ok) {
            throw new Error(await readErrorMessage(response, `${path} failed`))
        }
        return assertSuccessEnvelope(await response.json())
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
    preferredPort?: number
    staticDir?: string
    requireStaticDir?: boolean
}): Promise<{
    client: CoreServerClient
    server: CoreHttpServerHandle
    close: () => Promise<void>
}> {
    const processInfo = await ensureCoreServerProcess({
        host: options?.host,
        preferredPort: options?.preferredPort,
        memoHome: options?.memoHome,
        staticDir: options?.staticDir,
        requireStaticDir: options?.requireStaticDir,
    })

    try {
        const client = await CoreServerClient.fromPassword(
            processInfo.baseUrl,
            processInfo.password,
        )
        return {
            client,
            server: {
                url: processInfo.baseUrl,
                openApiSpecPath: '/api/openapi.json',
                close: async () => {
                    // Shared daemon server is managed by launcher, not per-client lifecycle.
                },
            },
            close: async () => {
                // Shared daemon server is managed by launcher, not per-client lifecycle.
            },
        }
    } catch (error) {
        throw new Error(`Failed to initialize core server client: ${resolveMessage(error)}`)
    }
}
