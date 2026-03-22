import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import {
    loadMemoConfig,
    resolveContextWindowForProvider,
    selectProvider,
} from '@memo/core/config/config'
import { HistoryIndex } from '@memo/core/runtime/history/indexer'
import { createAgentSession } from '@memo/core/runtime/session'
import {
    defaultWorkspaceName,
    normalizeWorkspacePath,
    workspaceIdFromCwd,
} from '@memo/core/runtime/workspace'
import type {
    AgentSession,
    AgentSessionDeps,
    ApprovalDecision,
    ApprovalRequest,
    ChatMessage,
    ToolPermissionMode,
} from '@memo/core/types'
import type {
    LiveSessionState,
    QueuedInputItem,
    SessionDetail,
    SessionEventsResponse,
    SessionListResponse,
    SessionRuntimeBadge,
} from '@memo/core/web/types'
import type { SseHub } from '@memo/core/server/utils/sse'

const DEFAULT_MAX_LIVE_SESSIONS = 20
const DEFAULT_MAX_QUEUED_INPUTS = 5

export type CreateLiveSessionInput = {
    sessionId?: string
    providerName?: string
    cwd?: string
    toolPermissionMode?: ToolPermissionMode
    activeMcpServers?: string[]
}

export type SubmitMessageResult = {
    accepted: boolean
    queueId: string
    queued: number
}

export type QueueMutationResult = {
    removed?: boolean
    triggered?: boolean
    queued: number
}

type LiveSessionRuntime = {
    id: string
    title: string
    workspaceId: string
    projectName: string
    providerName: string
    model: string
    cwd: string
    startedAt: string
    status: 'idle' | 'running' | 'closed'
    pendingApproval?: {
        fingerprint: string
        toolName: string
        reason: string
        riskLevel: string
        params: unknown
    }
    activeMcpServers: string[]
    toolPermissionMode: ToolPermissionMode
    queuedInputs: QueuedInputItem[]
    currentContextTokens?: number
    contextWindow?: number
    historyFilePath?: string
    availableToolNames?: string[]
    pendingApprovals: Map<string, (decision: ApprovalDecision) => void>
    queueDraining: boolean
    closed: boolean
    currentTurn: number
    agentSession: AgentSession
}

function normalizeToolPermissionMode(input: unknown): ToolPermissionMode {
    if (input === 'none' || input === 'once' || input === 'full') {
        return input
    }
    return 'once'
}

function parseActiveMcpServers(input: unknown): string[] {
    if (!Array.isArray(input)) return []
    return Array.from(
        new Set(
            input
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    )
}

export class CoreSessionManager {
    private readonly sessions = new Map<string, LiveSessionRuntime>()
    private historyIndex: HistoryIndex | null = null

    constructor(
        private readonly options: {
            sseHub: SseHub
            memoHome?: string
            maxLiveSessions?: number
            maxQueuedInputs?: number
        },
    ) {}

    async createSession(input: CreateLiveSessionInput): Promise<LiveSessionState> {
        const maxLiveSessions = this.options.maxLiveSessions ?? DEFAULT_MAX_LIVE_SESSIONS
        if (this.sessions.size >= maxLiveSessions) {
            throw new Error(`Too many live sessions (max=${maxLiveSessions})`)
        }

        const loaded = await loadMemoConfig()
        const provider = selectProvider(loaded.config, input.providerName)
        const cwd = normalizeWorkspacePath(input.cwd?.trim() || process.cwd())
        const workspaceId = workspaceIdFromCwd(cwd)
        const contextWindow = resolveContextWindowForProvider(loaded.config, provider)
        const requestedMcpServers = parseActiveMcpServers(input.activeMcpServers)
        const activeMcpServers =
            requestedMcpServers.length > 0
                ? requestedMcpServers
                : loaded.config.active_mcp_servers || []
        const toolPermissionMode = normalizeToolPermissionMode(input.toolPermissionMode)
        const preferredSessionId = input.sessionId?.trim()
        const id = preferredSessionId || randomUUID()
        if (this.sessions.has(id)) {
            throw new Error(`session already exists: ${id}`)
        }

        let runtimeRef: LiveSessionRuntime | null = null
        const deps: AgentSessionDeps = {
            onAssistantStep: (content, step) => {
                if (!content) return
                const runtime = runtimeRef
                if (!runtime) return
                const turn = runtime.currentTurn || 1
                this.emit(runtime.id, 'assistant.chunk', {
                    turn,
                    step,
                    chunk: content,
                })
            },
            hooks: {
                onTurnStart: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.currentTurn = payload.turn
                    runtime.status = 'running'
                    this.emit(runtime.id, 'turn.start', {
                        turn: payload.turn,
                        input: payload.input,
                        promptTokens: payload.promptTokens,
                    })
                    this.emit(runtime.id, 'session.status', { status: 'running' })
                    this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
                },
                onContextUsage: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.currentContextTokens = payload.promptTokens
                    runtime.contextWindow = payload.contextWindow
                    this.emit(runtime.id, 'context.usage', {
                        turn: payload.turn,
                        step: payload.step,
                        phase: payload.phase,
                        promptTokens: payload.promptTokens,
                        contextWindow: payload.contextWindow,
                        thresholdTokens: payload.thresholdTokens,
                        usagePercent: payload.usagePercent,
                    })
                },
                onContextCompacted: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.currentContextTokens = payload.afterTokens
                    this.emit(runtime.id, 'context.compact', {
                        turn: payload.turn,
                        step: payload.step,
                        reason: payload.reason,
                        status: payload.status,
                        beforeTokens: payload.beforeTokens,
                        afterTokens: payload.afterTokens,
                        thresholdTokens: payload.thresholdTokens,
                        reductionPercent: payload.reductionPercent,
                        summary: payload.summary,
                        errorMessage: payload.errorMessage,
                    })
                },
                onAction: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    this.emit(runtime.id, 'tool.action', {
                        turn: payload.turn,
                        step: payload.step,
                        action: payload.action,
                        parallelActions: payload.parallelActions,
                        thinking: payload.thinking,
                    })
                },
                onObservation: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    this.emit(runtime.id, 'tool.observation', {
                        turn: payload.turn,
                        step: payload.step,
                        observation: payload.observation,
                        resultStatus: payload.resultStatus,
                        parallelResultStatuses: payload.parallelResultStatuses,
                    })
                },
                onApprovalRequest: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.pendingApproval = {
                        fingerprint: payload.request.fingerprint,
                        toolName: payload.request.toolName,
                        reason: payload.request.reason,
                        riskLevel: payload.request.riskLevel,
                        params: payload.request.params,
                    }
                    this.emit(runtime.id, 'approval.request', runtime.pendingApproval)
                    this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
                },
                onApprovalResponse: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.pendingApproval = undefined
                    this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
                    this.emit(runtime.id, 'system.message', {
                        title: 'Approval response recorded',
                        content: `${payload.fingerprint}: ${payload.decision}`,
                        tone: 'info',
                    })
                },
                onFinal: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.pendingApproval = undefined
                    this.emit(runtime.id, 'turn.final', {
                        turn: payload.turn,
                        step: payload.step,
                        finalText: payload.finalText,
                        status: payload.status,
                        errorMessage: payload.errorMessage,
                        turnUsage: payload.turnUsage,
                        tokenUsage: payload.tokenUsage ?? payload.turnUsage,
                    })
                },
                onTitleGenerated: (payload) => {
                    const runtime = runtimeRef
                    if (!runtime) return
                    runtime.title = payload.title
                    this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
                },
            },
            requestApproval: async (request: ApprovalRequest): Promise<ApprovalDecision> => {
                const runtime = runtimeRef
                if (!runtime || runtime.closed) return 'deny'
                return new Promise<ApprovalDecision>((resolveDecision) => {
                    runtime.pendingApprovals.set(request.fingerprint, resolveDecision)
                })
            },
        }

        const agentSession = await createAgentSession(deps, {
            sessionId: id,
            cwd,
            providerName: provider.name,
            toolPermissionMode,
            contextWindow,
            activeMcpServers,
            autoCompactThresholdPercent: loaded.config.auto_compact_threshold_percent,
        })

        runtimeRef = {
            id,
            title: 'New Session',
            workspaceId,
            projectName: defaultWorkspaceName(cwd),
            providerName: provider.name,
            model: provider.model,
            cwd,
            startedAt: new Date().toISOString(),
            status: 'idle',
            activeMcpServers,
            toolPermissionMode,
            queuedInputs: [],
            currentContextTokens: 0,
            contextWindow,
            historyFilePath: agentSession.historyFilePath,
            availableToolNames: agentSession.listToolNames?.() ?? [],
            pendingApprovals: new Map(),
            queueDraining: false,
            closed: false,
            currentTurn: 0,
            agentSession,
        }

        this.sessions.set(id, runtimeRef)
        this.emit(id, 'session.snapshot', this.toLiveState(runtimeRef))

        return this.toLiveState(runtimeRef)
    }

    getSessionState(sessionId: string): LiveSessionState | null {
        const session = this.sessions.get(sessionId)
        if (!session) return null
        return this.toLiveState(session)
    }

    async closeSession(sessionId: string): Promise<{ removed: boolean }> {
        const runtime = this.sessions.get(sessionId)
        if (!runtime) return { removed: false }

        runtime.closed = true
        runtime.status = 'closed'
        runtime.queuedInputs = []

        for (const resolver of runtime.pendingApprovals.values()) {
            resolver('deny')
        }
        runtime.pendingApprovals.clear()

        await runtime.agentSession.close()

        this.emit(runtime.id, 'session.status', { status: 'closed' })
        this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
        this.options.sseHub.closeSession(runtime.id)

        this.sessions.delete(runtime.id)
        return { removed: true }
    }

    async submitMessage(sessionId: string, input: string): Promise<SubmitMessageResult> {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        const trimmed = input.trim()
        if (!trimmed) {
            throw new Error('input is required')
        }

        const maxQueued = this.options.maxQueuedInputs ?? DEFAULT_MAX_QUEUED_INPUTS
        if (runtime.queuedInputs.length >= maxQueued) {
            throw new Error(`queue is full (max=${maxQueued})`)
        }

        const queueId = randomUUID()
        const queued: QueuedInputItem = {
            id: queueId,
            input: trimmed,
            createdAt: new Date().toISOString(),
        }

        runtime.queuedInputs.push(queued)
        this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
        void this.drainQueue(runtime)

        return {
            accepted: true,
            queueId,
            queued: runtime.queuedInputs.length,
        }
    }

    removeQueuedInput(sessionId: string, queueId: string): QueueMutationResult {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        const before = runtime.queuedInputs.length
        runtime.queuedInputs = runtime.queuedInputs.filter((item) => item.id !== queueId)
        const removed = runtime.queuedInputs.length < before

        if (removed) {
            this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
        }

        return {
            removed,
            queued: runtime.queuedInputs.length,
        }
    }

    sendQueuedInputNow(sessionId: string): QueueMutationResult {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        if (runtime.queuedInputs.length === 0) {
            return {
                triggered: false,
                queued: 0,
            }
        }

        if (!runtime.queueDraining) {
            void this.drainQueue(runtime)
        }

        return {
            triggered: true,
            queued: runtime.queuedInputs.length,
        }
    }

    cancelTurn(sessionId: string): { cancelled: boolean } {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) return { cancelled: false }

        runtime.agentSession.cancelCurrentTurn?.('cancelled from HTTP API')
        return { cancelled: true }
    }

    async compactSession(sessionId: string): Promise<{
        reason: string
        status: string
        beforeTokens: number
        afterTokens: number
        thresholdTokens: number
        reductionPercent: number
        summary?: string
        errorMessage?: string
        keptMessages: number
    }> {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        const result = await runtime.agentSession.compactHistory('manual')
        runtime.currentContextTokens = result.afterTokens
        this.emit(runtime.id, 'context.usage', {
            turn: runtime.currentTurn,
            step: 0,
            phase: 'post_compact',
            promptTokens: result.afterTokens,
            contextWindow: runtime.contextWindow ?? 0,
            thresholdTokens: result.thresholdTokens,
            usagePercent:
                result.afterTokens > 0 && runtime.contextWindow
                    ? Math.round((result.afterTokens / runtime.contextWindow) * 10_000) / 100
                    : 0,
        })

        return {
            reason: result.reason,
            status: result.status,
            beforeTokens: result.beforeTokens,
            afterTokens: result.afterTokens,
            thresholdTokens: result.thresholdTokens,
            reductionPercent: result.reductionPercent,
            summary: result.summary,
            errorMessage: result.errorMessage,
            keptMessages: runtime.agentSession.history.length,
        }
    }

    applyApprovalDecision(
        sessionId: string,
        fingerprint: string,
        decision: ApprovalDecision,
    ): { recorded: boolean } {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        const resolver = runtime.pendingApprovals.get(fingerprint)
        if (!resolver) {
            throw new Error(`approval not found: ${fingerprint}`)
        }

        runtime.pendingApprovals.delete(fingerprint)
        runtime.pendingApproval = undefined
        resolver(decision)
        this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
        return { recorded: true }
    }

    restoreHistory(
        sessionId: string,
        messages: unknown[],
    ): { restored: boolean; messages: number } {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) {
            throw new Error(`session not found: ${sessionId}`)
        }

        const normalized = normalizeHistoryMessages(messages)
        const system = runtime.agentSession.history[0]
        if (!system || system.role !== 'system') {
            throw new Error('session history is missing system prompt')
        }

        runtime.agentSession.history.splice(
            0,
            runtime.agentSession.history.length,
            system,
            ...normalized,
        )
        this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
        return { restored: true, messages: normalized.length }
    }

    async listProviders(): Promise<{
        items: Array<{ name: string; model: string; env_api_key: string; base_url?: string }>
    }> {
        const loaded = await loadMemoConfig()
        return {
            items: loaded.config.providers.map((provider) => ({
                name: provider.name,
                model: provider.model,
                env_api_key: provider.env_api_key,
                base_url: provider.base_url,
            })),
        }
    }

    listRuntimeBadges(query?: { workspaceCwd?: string }): { items: SessionRuntimeBadge[] } {
        const workspaceCwd = query?.workspaceCwd?.trim()
        const targetWorkspaceId = workspaceCwd
            ? workspaceIdFromCwd(normalizeWorkspacePath(workspaceCwd))
            : null

        const items = Array.from(this.sessions.values())
            .filter((runtime) => !runtime.closed)
            .filter((runtime) =>
                targetWorkspaceId ? runtime.workspaceId === targetWorkspaceId : true,
            )
            .map((runtime) => ({
                sessionId: runtime.id,
                workspaceId: runtime.workspaceId,
                status: runtime.status,
                updatedAt: new Date().toISOString(),
            }))

        return { items }
    }

    async listSessions(query: {
        page?: number
        pageSize?: number
        sortBy?: 'updatedAt' | 'startedAt' | 'project' | 'title'
        order?: 'asc' | 'desc'
        project?: string
        workspaceCwd?: string
        dateFrom?: string
        dateTo?: string
        q?: string
    }): Promise<SessionListResponse> {
        const index = await this.getHistoryIndex()
        return index.list(query)
    }

    async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
        const index = await this.getHistoryIndex()
        return index.getSessionDetail(sessionId)
    }

    async getSessionEvents(
        sessionId: string,
        cursor?: string,
        limit?: number,
    ): Promise<SessionEventsResponse | null> {
        const index = await this.getHistoryIndex()
        return index.getSessionEvents(sessionId, cursor, limit)
    }

    async removeSessionHistory(sessionId: string): Promise<{ deleted: boolean }> {
        const index = await this.getHistoryIndex()
        return index.removeSession(sessionId)
    }

    resolveSessionCwd(sessionId: string): string | null {
        const runtime = this.sessions.get(sessionId)
        if (!runtime || runtime.closed) return null
        return runtime.cwd
    }

    async close(): Promise<void> {
        const ids = Array.from(this.sessions.keys())
        for (const id of ids) {
            await this.closeSession(id)
        }
    }

    private async getHistoryIndex(): Promise<HistoryIndex> {
        if (this.historyIndex) return this.historyIndex

        const loaded = await loadMemoConfig()
        const memoHome = this.options.memoHome ? resolve(this.options.memoHome) : loaded.home
        this.historyIndex = new HistoryIndex({
            sessionsDir: join(memoHome, 'sessions'),
        })
        return this.historyIndex
    }

    private toLiveState(runtime: LiveSessionRuntime): LiveSessionState {
        return {
            id: runtime.id,
            title: runtime.title,
            workspaceId: runtime.workspaceId,
            projectName: runtime.projectName,
            providerName: runtime.providerName,
            model: runtime.model,
            cwd: runtime.cwd,
            startedAt: runtime.startedAt,
            status: runtime.status,
            pendingApproval: runtime.pendingApproval,
            activeMcpServers: runtime.activeMcpServers,
            toolPermissionMode: runtime.toolPermissionMode,
            queuedInputs: runtime.queuedInputs,
            currentContextTokens: runtime.currentContextTokens,
            contextWindow: runtime.contextWindow,
            historyFilePath: runtime.historyFilePath,
            availableToolNames: runtime.availableToolNames,
        }
    }

    private emit(sessionId: string, event: string, payload: unknown): void {
        this.options.sseHub.publish(sessionId, event, payload)
    }

    private async drainQueue(runtime: LiveSessionRuntime): Promise<void> {
        if (runtime.queueDraining || runtime.closed) return
        runtime.queueDraining = true

        try {
            while (!runtime.closed && runtime.queuedInputs.length > 0) {
                const next = runtime.queuedInputs.shift()
                if (!next) continue

                runtime.status = 'running'
                this.emit(runtime.id, 'session.status', { status: 'running' })
                this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))

                try {
                    await runtime.agentSession.runTurn(next.input)
                } catch (error) {
                    this.emit(runtime.id, 'error', {
                        code: 'TURN_FAILED',
                        message: (error as Error).message,
                    })
                } finally {
                    runtime.status = runtime.closed ? 'closed' : 'idle'
                    this.emit(runtime.id, 'session.status', {
                        status: runtime.status,
                    })
                    this.emit(runtime.id, 'session.snapshot', this.toLiveState(runtime))
                }
            }
        } finally {
            runtime.queueDraining = false
        }
    }
}

function normalizeHistoryMessages(messages: unknown[]): ChatMessage[] {
    const normalized: ChatMessage[] = []
    for (const item of messages) {
        if (!item || typeof item !== 'object') {
            throw new Error('history messages must be objects')
        }

        const role = (item as { role?: unknown }).role
        const content = (item as { content?: unknown }).content
        if (typeof content !== 'string') {
            throw new Error('history message content must be string')
        }

        if (role === 'user') {
            normalized.push({ role: 'user', content })
            continue
        }

        if (role === 'assistant') {
            const reasoningContent = (item as { reasoning_content?: unknown }).reasoning_content
            normalized.push({
                role: 'assistant',
                content,
                ...(typeof reasoningContent === 'string'
                    ? { reasoning_content: reasoningContent }
                    : {}),
            })
            continue
        }

        if (role === 'tool') {
            const toolCallId = (item as { tool_call_id?: unknown }).tool_call_id
            const name = (item as { name?: unknown }).name
            if (typeof toolCallId !== 'string' || !toolCallId.trim()) {
                throw new Error('tool message requires tool_call_id')
            }
            normalized.push({
                role: 'tool',
                content,
                tool_call_id: toolCallId,
                ...(typeof name === 'string' ? { name } : {}),
            })
            continue
        }

        throw new Error(`unsupported history role: ${String(role)}`)
    }

    return normalized
}
