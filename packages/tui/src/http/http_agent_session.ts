import type {
    AgentSession,
    AgentSessionDeps,
    AgentSessionOptions,
    ChatMessage,
    CompactReason,
    CompactResult,
    ContextUsagePhase,
    TokenUsage,
    ToolActionStatus,
    ToolPermissionMode,
    TurnResult,
    TurnStatus,
    LiveSessionState,
    SseEventEnvelope,
} from './api_types'
import type { ApprovalDecision, ApprovalRequest, RiskLevel } from '@memo/tools/approval'
import { getSharedCoreServerClient, type CoreServerClient } from './shared_core_client'

type PendingTurn = {
    input: string
    turn?: number
    resolve: (result: TurnResult) => void
    reject: (error: Error) => void
}

type HttpAgentSession = AgentSession & {
    restoreHistory: (messages: ChatMessage[]) => Promise<void>
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }
    return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeTurnStatus(value: unknown): TurnStatus {
    if (value === 'ok' || value === 'error' || value === 'prompt_limit' || value === 'cancelled') {
        return value
    }
    return 'error'
}

function normalizeCompactStatus(value: unknown): CompactResult['status'] {
    if (value === 'success' || value === 'failed' || value === 'skipped') {
        return value
    }
    return 'failed'
}

function normalizeContextPhase(value: unknown): ContextUsagePhase {
    if (value === 'turn_start' || value === 'step_start' || value === 'post_compact') {
        return value
    }
    return 'step_start'
}

function parseTokenUsage(value: unknown): TokenUsage | undefined {
    const record = asRecord(value)
    if (!record) return undefined
    const prompt = asNumber(record.prompt)
    const completion = asNumber(record.completion)
    const total = asNumber(record.total)
    if (prompt === undefined || completion === undefined || total === undefined) {
        return undefined
    }
    return { prompt, completion, total }
}

function ensureTokenUsage(value: TokenUsage | undefined): TokenUsage {
    return value ?? { prompt: 0, completion: 0, total: 0 }
}

function resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error || 'unknown error')
}

function normalizeToolPermissionMode(options: AgentSessionOptions): ToolPermissionMode {
    if (
        options.toolPermissionMode === 'none' ||
        options.toolPermissionMode === 'once' ||
        options.toolPermissionMode === 'full'
    ) {
        return options.toolPermissionMode
    }
    return options.dangerous ? 'full' : 'once'
}

function normalizeRiskLevel(value: unknown): RiskLevel {
    if (value === 'read' || value === 'write' || value === 'execute') {
        return value
    }
    return 'write'
}

function normalizeApprovalDecision(value: unknown): ApprovalDecision {
    if (value === 'once' || value === 'session' || value === 'deny') {
        return value
    }
    return 'deny'
}

function parseToolActions(value: unknown): Array<{ tool: string; input: unknown }> | undefined {
    if (!Array.isArray(value)) return undefined

    const actions = value
        .map((item) => {
            const record = asRecord(item)
            if (!record) return null
            const tool = asString(record.tool)
            if (!tool) return null
            return { tool, input: record.input }
        })
        .filter((item): item is { tool: string; input: unknown } => Boolean(item))
    return actions.length > 0 ? actions : undefined
}

class HttpBackedAgentSession implements HttpAgentSession {
    readonly mode = 'interactive' as const
    readonly history: ChatMessage[] = [{ role: 'system', content: '' }]

    readonly id: string
    title?: string
    historyFilePath?: string

    private closed = false
    private closePromise: Promise<void> | null = null
    private pendingTurns: PendingTurn[] = []
    private currentTurn = 0
    private currentStep = 0
    private availableToolNames: string[] = []
    private currentContextTokens = 0
    private contextWindow = 0
    private streamError: Error | null = null
    private readonly closeEvents: () => void
    private readonly eventsDone: Promise<void>

    constructor(
        private readonly client: CoreServerClient,
        private readonly deps: AgentSessionDeps,
        initialState: LiveSessionState,
    ) {
        this.id = initialState.id
        this.applySnapshot(initialState)

        const subscription = this.client.subscribeSessionEvents(this.id, async (event) => {
            await this.handleEvent(event)
        })
        this.closeEvents = subscription.close
        this.eventsDone = subscription.done
            .then(() => {
                if (this.closed) return
                const error = new Error('session event stream closed unexpectedly')
                this.streamError = error
                this.rejectPendingTurns(error)
            })
            .catch((error) => {
                if (this.closed) return
                const wrapped = new Error(
                    `session event stream failed: ${resolveErrorMessage(error)}`,
                )
                this.streamError = wrapped
                this.rejectPendingTurns(wrapped)
            })
    }

    listToolNames(): string[] {
        return [...this.availableToolNames]
    }

    async restoreHistory(messages: ChatMessage[]): Promise<void> {
        if (this.closed) throw new Error('session already closed')

        const normalized = messages.filter((message) => message.role !== 'system')
        await this.client.restoreHistory(this.id, normalized)

        const system = this.history[0] ?? { role: 'system', content: '' }
        this.history.splice(0, this.history.length, system, ...normalized)
    }

    async runTurn(input: string): Promise<TurnResult> {
        if (this.closed) throw new Error('session already closed')
        if (this.streamError) throw this.streamError

        const trimmed = input.trim()
        if (!trimmed) {
            throw new Error('input is required')
        }

        return new Promise<TurnResult>((resolve, reject) => {
            const pending: PendingTurn = {
                input: trimmed,
                resolve,
                reject,
            }
            this.pendingTurns.push(pending)

            void this.client.submitMessage(this.id, trimmed).catch((error) => {
                this.pendingTurns = this.pendingTurns.filter((item) => item !== pending)
                reject(new Error(resolveErrorMessage(error)))
            })
        })
    }

    cancelCurrentTurn(): void {
        if (this.closed) return
        void this.client.cancelTurn(this.id).catch(() => {})
    }

    async compactHistory(reason: CompactReason = 'manual'): Promise<CompactResult> {
        if (this.closed) throw new Error('session already closed')

        const response = await this.client.compactSession(this.id)
        const result: CompactResult = {
            reason,
            status: normalizeCompactStatus(response.status),
            beforeTokens: asNumber(response.beforeTokens) ?? this.currentContextTokens,
            afterTokens: asNumber(response.afterTokens) ?? this.currentContextTokens,
            thresholdTokens: asNumber(response.thresholdTokens) ?? 0,
            reductionPercent: asNumber(response.reductionPercent) ?? 0,
            summary: asString(response.summary),
            errorMessage: asString(response.errorMessage),
        }

        this.currentContextTokens = result.afterTokens
        return result
    }

    async close(): Promise<void> {
        if (this.closePromise) return this.closePromise

        this.closePromise = (async () => {
            this.closed = true
            this.closeEvents()
            this.rejectPendingTurns(new Error('session closed'))

            try {
                await this.client.closeSession(this.id)
            } catch {
                // Best-effort close; server may already be down.
            }

            await this.eventsDone
        })()

        return this.closePromise
    }

    private applySnapshot(state: LiveSessionState): void {
        this.title = state.title
        this.historyFilePath = state.historyFilePath
        this.availableToolNames = state.availableToolNames ?? []
        this.currentContextTokens = state.currentContextTokens ?? this.currentContextTokens
        this.contextWindow = state.contextWindow ?? this.contextWindow
    }

    private rejectPendingTurns(error: Error): void {
        const pending = this.pendingTurns
        this.pendingTurns = []
        for (const item of pending) {
            item.reject(error)
        }
    }

    private async handleEvent(envelope: SseEventEnvelope): Promise<void> {
        if (this.closed) return
        const payload = asRecord(envelope.data)
        if (!payload) return

        switch (envelope.event) {
            case 'session.snapshot': {
                this.applySnapshot(payload as unknown as LiveSessionState)
                return
            }
            case 'turn.start': {
                const turn = asNumber(payload.turn)
                const input = asString(payload.input) ?? ''
                const promptTokens = asNumber(payload.promptTokens)
                if (turn !== undefined) {
                    this.currentTurn = turn
                    this.currentStep = 0
                    const pending = this.pendingTurns.find((item) => item.turn === undefined)
                    if (pending) pending.turn = turn
                }

                this.history.push({ role: 'user', content: input })
                await this.deps.hooks?.onTurnStart?.({
                    sessionId: this.id,
                    turn: this.currentTurn,
                    input,
                    promptTokens,
                    history: this.history,
                })
                return
            }
            case 'assistant.chunk': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step) ?? this.currentStep
                const chunk = asString(payload.chunk) ?? ''
                this.currentTurn = turn
                this.currentStep = step
                if (chunk) {
                    this.deps.onAssistantStep?.(chunk, step)
                }
                return
            }
            case 'context.usage': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step) ?? this.currentStep
                const promptTokens = asNumber(payload.promptTokens) ?? this.currentContextTokens
                const contextWindow = asNumber(payload.contextWindow) ?? this.contextWindow
                const thresholdTokens = asNumber(payload.thresholdTokens) ?? 0
                const usagePercent = asNumber(payload.usagePercent) ?? 0
                const phase = normalizeContextPhase(payload.phase)

                this.currentTurn = turn
                this.currentStep = step
                this.currentContextTokens = promptTokens
                this.contextWindow = contextWindow

                await this.deps.hooks?.onContextUsage?.({
                    sessionId: this.id,
                    turn,
                    step,
                    promptTokens,
                    contextWindow,
                    thresholdTokens,
                    usagePercent,
                    phase,
                })
                return
            }
            case 'tool.action': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step) ?? this.currentStep
                const actionRecord = asRecord(payload.action)
                const actionTool = actionRecord ? asString(actionRecord.tool) : undefined
                if (!actionTool) return

                this.currentTurn = turn
                this.currentStep = step

                await this.deps.hooks?.onAction?.({
                    sessionId: this.id,
                    turn,
                    step,
                    action: {
                        tool: actionTool,
                        input: actionRecord?.input,
                    },
                    parallelActions: parseToolActions(payload.parallelActions),
                    thinking: asString(payload.thinking),
                    history: this.history,
                })
                return
            }
            case 'context.compact': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step) ?? this.currentStep
                const result: CompactResult = {
                    reason: payload.reason === 'auto' ? 'auto' : 'manual',
                    status: normalizeCompactStatus(payload.status),
                    beforeTokens: asNumber(payload.beforeTokens) ?? this.currentContextTokens,
                    afterTokens: asNumber(payload.afterTokens) ?? this.currentContextTokens,
                    thresholdTokens: asNumber(payload.thresholdTokens) ?? 0,
                    reductionPercent: asNumber(payload.reductionPercent) ?? 0,
                    summary: asString(payload.summary),
                    errorMessage: asString(payload.errorMessage),
                }

                this.currentTurn = turn
                this.currentStep = step
                this.currentContextTokens = result.afterTokens
                await this.deps.hooks?.onContextCompacted?.({
                    sessionId: this.id,
                    turn,
                    step,
                    ...result,
                })
                return
            }
            case 'tool.observation': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step) ?? this.currentStep
                const observation = asString(payload.observation) ?? ''
                this.currentTurn = turn
                this.currentStep = step

                const resultStatus = asString(payload.resultStatus) as ToolActionStatus | undefined
                const parallelResultStatuses = Array.isArray(payload.parallelResultStatuses)
                    ? payload.parallelResultStatuses.filter(
                          (item): item is ToolActionStatus => typeof item === 'string',
                      )
                    : undefined

                await this.deps.hooks?.onObservation?.({
                    sessionId: this.id,
                    turn,
                    step,
                    tool: 'unknown',
                    observation,
                    resultStatus,
                    parallelResultStatuses,
                    history: this.history,
                })
                return
            }
            case 'approval.request': {
                await this.handleApprovalRequest(payload)
                return
            }
            case 'turn.final': {
                const turn = asNumber(payload.turn) ?? this.currentTurn
                const step = asNumber(payload.step)
                const finalText = asString(payload.finalText) ?? ''
                const status = normalizeTurnStatus(payload.status)
                const errorMessage = asString(payload.errorMessage)
                const tokenUsage =
                    parseTokenUsage(payload.tokenUsage) ?? parseTokenUsage(payload.turnUsage)

                this.currentTurn = turn
                if (step !== undefined) {
                    this.currentStep = step
                }

                if (finalText) {
                    this.history.push({ role: 'assistant', content: finalText })
                }

                await this.deps.hooks?.onFinal?.({
                    sessionId: this.id,
                    turn,
                    step,
                    finalText,
                    status,
                    errorMessage,
                    tokenUsage,
                    turnUsage: ensureTokenUsage(tokenUsage),
                    steps: [],
                })

                const pending =
                    this.pendingTurns.find((item) => item.turn === turn) ?? this.pendingTurns[0]
                if (pending) {
                    this.pendingTurns = this.pendingTurns.filter((item) => item !== pending)
                    pending.resolve({
                        finalText,
                        steps: [],
                        status,
                        errorMessage,
                        tokenUsage: ensureTokenUsage(tokenUsage),
                    })
                }
                return
            }
            case 'error': {
                const message = asString(payload.message) ?? 'unknown error'
                const pending = this.pendingTurns.shift()
                if (pending) {
                    pending.reject(new Error(message))
                }
                return
            }
            default:
                return
        }
    }

    private async handleApprovalRequest(payload: Record<string, unknown>): Promise<void> {
        const fingerprint = asString(payload.fingerprint)
        const toolName = asString(payload.toolName)
        const reason = asString(payload.reason)
        if (!fingerprint || !toolName || !reason) return

        const request: ApprovalRequest = {
            fingerprint,
            toolName,
            reason,
            riskLevel: normalizeRiskLevel(payload.riskLevel),
            params: payload.params,
        }

        await this.deps.hooks?.onApprovalRequest?.({
            sessionId: this.id,
            turn: this.currentTurn,
            step: this.currentStep,
            request,
        })

        let decision: ApprovalDecision = 'deny'
        try {
            if (this.deps.requestApproval) {
                const userDecision = await this.deps.requestApproval(request)
                decision = normalizeApprovalDecision(userDecision)
            }
        } catch {
            decision = 'deny'
        }

        await this.client.respondApproval(this.id, fingerprint, decision)
        await this.deps.hooks?.onApprovalResponse?.({
            sessionId: this.id,
            turn: this.currentTurn,
            step: this.currentStep,
            fingerprint,
            decision,
        })
    }
}

export async function createHttpAgentSession(
    deps: AgentSessionDeps,
    options: AgentSessionOptions,
): Promise<HttpAgentSession> {
    const client = await getSharedCoreServerClient()

    const state = await client.createSession({
        sessionId: options.sessionId,
        providerName: options.providerName,
        cwd: options.cwd,
        toolPermissionMode: normalizeToolPermissionMode(options),
        activeMcpServers: options.activeMcpServers,
    })

    return new HttpBackedAgentSession(client, deps, state)
}

export type { HttpAgentSession }
