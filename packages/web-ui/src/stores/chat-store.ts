import { create } from 'zustand'
import { chatApi, onWsReconnect, wsSubscribe } from '@/api'
import type {
    ChatTurn,
    LiveSessionState,
    SessionInputResult,
    SessionRuntimeBadge,
    SessionTurnStep,
} from '@/api/types'
import { calculateContextPercent } from '@/utils/context'
import { getErrorMessage } from '@/utils/error'

type ChatStore = {
    liveSession: LiveSessionState | null
    turns: ChatTurn[]
    systemMessages: string[]
    runtimeBadges: Record<string, SessionRuntimeBadge>
    currentContextTokens: number
    contextLimit: number
    contextPercent: number
    loading: boolean
    connected: boolean
    error: string | null
    clearError: () => void
    setRuntimeBadges: (items: SessionRuntimeBadge[]) => void
    createSession: (workspaceId: string) => Promise<string | null>
    attachSession: (sessionId: string) => Promise<void>
    sendInput: (value: string) => Promise<SessionInputResult | null>
    removeQueuedInput: (queueId: string) => Promise<boolean>
    sendQueuedInputNow: () => Promise<boolean>
    cancelCurrentTurn: () => Promise<void>
    approvePendingApproval: (decision: 'once' | 'session' | 'deny') => Promise<boolean>
    compactCurrentSession: () => Promise<void>
    connectStream: (sessionId: string) => void
    disconnectStream: () => void
    reset: () => void
}

type TurnFinalPayload = {
    turn: number
    finalText: string
    status: string
    errorMessage?: string
}

type ToolAction = NonNullable<SessionTurnStep['action']>

type ToolActionPayload = {
    turn: number
    step: number
    action: ToolAction
    parallelActions?: ToolAction[]
    thinking?: string
}

type ToolObservationPayload = {
    turn: number
    step: number
    observation: string
    resultStatus?: string
}

let subscriptionsInitialized = false
let activeSessionId: string | null = null

function normalizeAction(value: unknown): ToolAction | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const tool = (value as Record<string, unknown>).tool
    if (typeof tool !== 'string' || !tool.trim()) return undefined
    return {
        tool,
        input: (value as Record<string, unknown>).input,
    }
}

function normalizeActions(value: unknown): ToolAction[] | undefined {
    if (!Array.isArray(value)) return undefined
    const items = value.map((item) => normalizeAction(item)).filter(Boolean) as ToolAction[]
    return items.length > 0 ? items : undefined
}

function normalizeStep(step: SessionTurnStep): SessionTurnStep {
    return {
        step: step.step,
        assistantText: step.assistantText,
        thinking: step.thinking,
        action: step.action,
        parallelActions: step.parallelActions,
        observation: step.observation,
        resultStatus: step.resultStatus,
    }
}

function normalizeSteps(raw: unknown): SessionTurnStep[] {
    if (!Array.isArray(raw)) return []
    const steps: SessionTurnStep[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const record = item as Record<string, unknown>
        const step = record.step
        if (typeof step !== 'number') continue

        const normalized: SessionTurnStep = { step }
        if (typeof record.assistantText === 'string')
            normalized.assistantText = record.assistantText
        if (typeof record.thinking === 'string') normalized.thinking = record.thinking
        const action = normalizeAction(record.action)
        if (action) normalized.action = action
        const parallelActions = normalizeActions(record.parallelActions)
        if (parallelActions) normalized.parallelActions = parallelActions
        if (typeof record.observation === 'string') normalized.observation = record.observation
        if (typeof record.resultStatus === 'string') normalized.resultStatus = record.resultStatus
        steps.push(normalized)
    }
    steps.sort((a, b) => a.step - b.step)
    return steps
}

function normalizeTurns(raw: unknown): ChatTurn[] {
    if (!Array.isArray(raw)) return []
    const turns: ChatTurn[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const record = item as Record<string, unknown>
        const turn = record.turn
        if (typeof turn !== 'number') continue
        turns.push({
            turn,
            input: typeof record.input === 'string' ? record.input : '',
            assistant: typeof record.assistant === 'string' ? record.assistant : '',
            status: typeof record.status === 'string' ? record.status : 'ok',
            errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : undefined,
            steps: normalizeSteps(record.steps),
        })
    }
    turns.sort((a, b) => a.turn - b.turn)
    return turns
}

function createEmptyTurn(turn: number): ChatTurn {
    return {
        turn,
        input: '',
        assistant: '',
        status: 'running',
        steps: [],
    }
}

function upsertTurn(
    turns: ChatTurn[],
    turnNumber: number,
    updater: (current: ChatTurn) => ChatTurn,
): ChatTurn[] {
    const next = [...turns]
    const index = next.findIndex((item) => item.turn === turnNumber)
    const current =
        index >= 0 ? (next[index] ?? createEmptyTurn(turnNumber)) : createEmptyTurn(turnNumber)
    const updated = updater(current)
    const normalized: ChatTurn = {
        ...updated,
        steps: normalizeSteps(updated.steps),
    }

    if (index >= 0) {
        next[index] = normalized
        return next
    }

    next.push(normalized)
    next.sort((a, b) => a.turn - b.turn)
    return next
}

function upsertStep(
    turn: ChatTurn,
    stepIndex: number,
    updater: (current: SessionTurnStep) => SessionTurnStep,
): ChatTurn {
    const steps = normalizeSteps(turn.steps)
    const index = steps.findIndex((item) => item.step === stepIndex)
    const current = index >= 0 ? (steps[index] ?? { step: stepIndex }) : { step: stepIndex }
    const updated = normalizeStep(updater(current))

    if (index >= 0) {
        steps[index] = updated
    } else {
        steps.push(updated)
        steps.sort((a, b) => a.step - b.step)
    }

    return {
        ...turn,
        steps,
    }
}

function applyTurnStart(turns: ChatTurn[], turn: number, input: string): ChatTurn[] {
    return upsertTurn(turns, turn, () => ({
        turn,
        input,
        assistant: '',
        status: 'running',
        errorMessage: undefined,
        steps: [],
    }))
}

function appendTurnChunk(turns: ChatTurn[], turn: number, step: number, chunk: string): ChatTurn[] {
    return upsertTurn(turns, turn, (current) =>
        upsertStep(
            {
                ...current,
                assistant: `${current.assistant}${chunk}`,
            },
            step,
            (currentStep) => ({
                ...currentStep,
                assistantText: `${currentStep.assistantText ?? ''}${chunk}`,
            }),
        ),
    )
}

function applyToolAction(turns: ChatTurn[], payload: ToolActionPayload): ChatTurn[] {
    return upsertTurn(turns, payload.turn, (current) =>
        upsertStep(current, payload.step, (currentStep) => ({
            ...currentStep,
            action: payload.action,
            parallelActions:
                payload.parallelActions && payload.parallelActions.length > 1
                    ? payload.parallelActions
                    : undefined,
            thinking: payload.thinking,
        })),
    )
}

function applyToolObservation(turns: ChatTurn[], payload: ToolObservationPayload): ChatTurn[] {
    return upsertTurn(turns, payload.turn, (current) =>
        upsertStep(current, payload.step, (currentStep) => ({
            ...currentStep,
            observation: payload.observation,
            resultStatus: payload.resultStatus,
        })),
    )
}

function patchTurnFinal(turns: ChatTurn[], payload: TurnFinalPayload): ChatTurn[] {
    return upsertTurn(turns, payload.turn, (current) => ({
        ...current,
        assistant: payload.finalText || current.assistant,
        status: payload.status,
        errorMessage: payload.errorMessage,
    }))
}

function withRuntimeBadge(
    prev: Record<string, SessionRuntimeBadge>,
    next: SessionRuntimeBadge,
): Record<string, SessionRuntimeBadge> {
    return {
        ...prev,
        [next.sessionId]: next,
    }
}

function normalizeNonNegativeNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value)
    if (typeof value === 'string') {
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed)) return Math.max(0, parsed)
    }
    return 0
}

function normalizePercent(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.min(100, value))
    }
    if (typeof value === 'string') {
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.min(100, parsed))
        }
    }
    return undefined
}

function ensureSubscriptions(
    set: (updater: Partial<ChatStore> | ((state: ChatStore) => Partial<ChatStore>)) => void,
): void {
    if (subscriptionsInitialized) return
    subscriptionsInitialized = true

    const asRecord = (value: unknown): Record<string, unknown> | null => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        return value as Record<string, unknown>
    }

    wsSubscribe('chat.session.snapshot', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string') return
        const state = asRecord(data.state) as LiveSessionState | null
        if (!state) return
        const normalizedCurrentContextTokens = normalizeNonNegativeNumber(state.currentContextTokens)
        const normalizedContextWindow = normalizeNonNegativeNumber(state.contextWindow)
        const normalizedContextPercent = calculateContextPercent(
            normalizedCurrentContextTokens,
            normalizedContextWindow,
        )
        const ignored = sessionId !== activeSessionId

        const badge: SessionRuntimeBadge = {
            sessionId,
            workspaceId: state.workspaceId,
            status: state.status,
            updatedAt: new Date().toISOString(),
        }

        if (ignored) {
            set((store) => ({
                runtimeBadges: withRuntimeBadge(store.runtimeBadges, badge),
            }))
            return
        }

        set((store) => ({
            connected: true,
            liveSession: state,
            turns: normalizeTurns(data.turns),
            systemMessages: [],
            error: null,
            currentContextTokens: normalizedCurrentContextTokens,
            contextLimit: normalizedContextWindow,
            contextPercent: normalizedContextPercent,
            runtimeBadges: withRuntimeBadge(store.runtimeBadges, badge),
        }))
    })

    wsSubscribe('chat.session.state', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string') return
        const state = asRecord(data.state) as LiveSessionState | null
        if (!state) return
        const normalizedCurrentContextTokens = normalizeNonNegativeNumber(state.currentContextTokens)
        const normalizedContextWindow = normalizeNonNegativeNumber(state.contextWindow)
        const normalizedContextPercent = calculateContextPercent(
            normalizedCurrentContextTokens,
            normalizedContextWindow,
        )
        const ignored = sessionId !== activeSessionId
        if (ignored) return

        set((store) => ({
            connected: true,
            liveSession: state,
            currentContextTokens: normalizedCurrentContextTokens,
            contextLimit: normalizedContextWindow,
            contextPercent: normalizedContextPercent,
            runtimeBadges: withRuntimeBadge(store.runtimeBadges, {
                sessionId,
                workspaceId: state.workspaceId,
                status: state.status,
                updatedAt: new Date().toISOString(),
            }),
        }))
    })

    wsSubscribe('chat.session.status', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string') return
        const status = data.status
        if (status !== 'idle' && status !== 'running' && status !== 'closed') return

        set((state) => {
            const workspaceId =
                typeof data.workspaceId === 'string'
                    ? data.workspaceId
                    : state.liveSession?.id === sessionId
                      ? state.liveSession.workspaceId
                      : state.runtimeBadges[sessionId]?.workspaceId
            if (!workspaceId) return {}

            return {
                liveSession:
                    state.liveSession?.id === sessionId
                        ? {
                              ...state.liveSession,
                              status,
                          }
                        : state.liveSession,
                runtimeBadges: withRuntimeBadge(state.runtimeBadges, {
                    sessionId,
                    workspaceId,
                    status,
                    updatedAt:
                        typeof data.updatedAt === 'string'
                            ? data.updatedAt
                            : new Date().toISOString(),
                }),
            }
        })
    })

    wsSubscribe('chat.runtime.status', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        const workspaceId = data.workspaceId
        const status = data.status
        const updatedAt = data.updatedAt

        if (typeof sessionId !== 'string') return
        if (typeof workspaceId !== 'string') return
        if (status !== 'idle' && status !== 'running' && status !== 'closed') return
        if (typeof updatedAt !== 'string') return

        set((state) => ({
            runtimeBadges: withRuntimeBadge(state.runtimeBadges, {
                sessionId,
                workspaceId,
                status,
                updatedAt,
            }),
        }))
    })

    wsSubscribe('chat.turn.start', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string') return
        const turn = data.turn
        if (typeof turn !== 'number') return
        const ignored = sessionId !== activeSessionId
        const input = typeof data.input === 'string' ? data.input : ''
        const promptTokens =
            typeof data.promptTokens === 'number' && Number.isFinite(data.promptTokens)
                ? Math.max(0, data.promptTokens)
                : undefined
        if (ignored) return

        set((state) => {
            const next: Partial<ChatStore> = {
                turns: applyTurnStart(state.turns, turn, input),
            }
            if (typeof promptTokens === 'number') {
                next.currentContextTokens = promptTokens
                next.contextPercent = calculateContextPercent(promptTokens, state.contextLimit)
            }
            return next
        })
    })

    wsSubscribe('chat.context.usage', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string') return
        const ignored = sessionId !== activeSessionId
        const promptTokens = normalizeNonNegativeNumber(data.promptTokens)
        const contextWindow = normalizeNonNegativeNumber(data.contextWindow)
        const usagePercent =
            normalizePercent(data.usagePercent) ??
            calculateContextPercent(promptTokens, contextWindow)
        if (ignored) return

        set({
            currentContextTokens: promptTokens,
            contextLimit: contextWindow,
            contextPercent: usagePercent,
        })
    })

    wsSubscribe('chat.turn.chunk', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return
        const turn = data.turn
        const step = data.step
        const chunk = data.chunk
        if (typeof turn !== 'number' || typeof step !== 'number' || typeof chunk !== 'string') {
            return
        }

        set((state) => ({
            turns: appendTurnChunk(state.turns, turn, step, chunk),
        }))
    })

    wsSubscribe('chat.tool.action', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return
        const turn = data.turn
        const step = data.step
        const action = normalizeAction(data.action)
        if (typeof turn !== 'number' || typeof step !== 'number' || !action) return
        const parallelActions = normalizeActions(data.parallelActions)
        const thinking = typeof data.thinking === 'string' ? data.thinking : undefined

        set((state) => ({
            turns: applyToolAction(state.turns, {
                turn,
                step,
                action,
                parallelActions,
                thinking,
            }),
        }))
    })

    wsSubscribe('chat.tool.observation', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return
        const turn = data.turn
        const step = data.step
        const observation = data.observation
        if (
            typeof turn !== 'number' ||
            typeof step !== 'number' ||
            typeof observation !== 'string'
        ) {
            return
        }
        const parallelStatuses = Array.isArray(data.parallelResultStatuses)
            ? data.parallelResultStatuses.filter((item): item is string => typeof item === 'string')
            : []
        const resultStatus =
            typeof data.resultStatus === 'string'
                ? data.resultStatus
                : (parallelStatuses.find((item) => item !== 'success') ?? parallelStatuses[0])

        set((state) => ({
            turns: applyToolObservation(state.turns, {
                turn,
                step,
                observation,
                resultStatus,
            }),
        }))
    })

    wsSubscribe('chat.turn.final', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return
        const turn = data.turn
        if (typeof turn !== 'number') return
        const finalText = typeof data.finalText === 'string' ? data.finalText : ''
        const status = typeof data.status === 'string' ? data.status : 'ok'
        const errorMessage = typeof data.errorMessage === 'string' ? data.errorMessage : undefined

        set((state) => ({
            turns: patchTurnFinal(state.turns, {
                turn,
                finalText,
                status,
                errorMessage,
            }),
        }))
    })

    wsSubscribe('chat.approval.request', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return

        const fingerprint = data.fingerprint
        const toolName = data.toolName
        const reason = data.reason
        const riskLevel = data.riskLevel
        if (
            typeof fingerprint !== 'string' ||
            typeof toolName !== 'string' ||
            typeof reason !== 'string' ||
            typeof riskLevel !== 'string'
        ) {
            return
        }

        set((state) => ({
            liveSession: state.liveSession
                ? {
                      ...state.liveSession,
                      pendingApproval: {
                          fingerprint,
                          toolName,
                          reason,
                          riskLevel,
                          params: data.params,
                      },
                  }
                : state.liveSession,
        }))
    })

    wsSubscribe('chat.system.message', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return

        const title = typeof data.title === 'string' ? data.title : 'System'
        const content = typeof data.content === 'string' ? data.content : ''

        set((state) => ({
            systemMessages: [...state.systemMessages, `${title}: ${content}`],
        }))
    })

    wsSubscribe('chat.error', (raw) => {
        const data = asRecord(raw)
        if (!data) return
        const sessionId = data.sessionId
        if (typeof sessionId !== 'string' || sessionId !== activeSessionId) return

        set({
            error: typeof data.message === 'string' ? data.message : 'Chat error',
        })
    })

    onWsReconnect(async () => {
        const currentSessionId = activeSessionId
        if (!currentSessionId) return

        try {
            const snapshot = await chatApi.attachLiveSession(currentSessionId)
            if (activeSessionId !== currentSessionId) return
            set((state) => ({
                connected: true,
                liveSession: snapshot.state,
                turns: normalizeTurns(snapshot.turns),
                currentContextTokens: normalizeNonNegativeNumber(
                    snapshot.state.currentContextTokens,
                ),
                contextLimit: normalizeNonNegativeNumber(snapshot.state.contextWindow),
                contextPercent: calculateContextPercent(
                    snapshot.state.currentContextTokens ?? 0,
                    snapshot.state.contextWindow ?? 0,
                ),
                error: null,
                runtimeBadges: withRuntimeBadge(state.runtimeBadges, {
                    sessionId: currentSessionId,
                    workspaceId: snapshot.state.workspaceId,
                    status: snapshot.state.status,
                    updatedAt: new Date().toISOString(),
                }),
            }))
        } catch (error) {
            if (activeSessionId !== currentSessionId) return
            set({
                connected: false,
                error: getErrorMessage(error, 'Failed to restore chat session after reconnect'),
            })
        }
    })
}

export const useChatStore = create<ChatStore>((set, get) => {
    ensureSubscriptions(set)

    return {
        liveSession: null,
        turns: [],
        systemMessages: [],
        runtimeBadges: {},
        currentContextTokens: 0,
        contextLimit: 0,
        contextPercent: 0,
        loading: false,
        connected: false,
        error: null,

        clearError() {
            set({ error: null })
        },

        setRuntimeBadges(items) {
            const next: Record<string, SessionRuntimeBadge> = {}
            for (const item of items) {
                next[item.sessionId] = item
            }
            set({ runtimeBadges: next })
        },

        async createSession(workspaceId) {
            const targetWorkspaceId = workspaceId.trim()
            if (!targetWorkspaceId) {
                set({ error: 'workspaceId is required' })
                return null
            }

            set({ loading: true, error: null })
            try {
                const state = await chatApi.createLiveSession({
                    workspaceId: targetWorkspaceId,
                })
                const snapshot = await chatApi.attachLiveSession(state.id)
                activeSessionId = state.id
                set((store) => ({
                    liveSession: snapshot.state,
                    turns: normalizeTurns(snapshot.turns),
                    systemMessages: [],
                    currentContextTokens: normalizeNonNegativeNumber(
                        snapshot.state.currentContextTokens,
                    ),
                    contextLimit: normalizeNonNegativeNumber(snapshot.state.contextWindow),
                    contextPercent: calculateContextPercent(
                        snapshot.state.currentContextTokens ?? 0,
                        snapshot.state.contextWindow ?? 0,
                    ),
                    loading: false,
                    connected: true,
                    runtimeBadges: withRuntimeBadge(store.runtimeBadges, {
                        sessionId: state.id,
                        workspaceId: snapshot.state.workspaceId,
                        status: snapshot.state.status,
                        updatedAt: new Date().toISOString(),
                    }),
                }))
                return state.id
            } catch (error) {
                set({
                    loading: false,
                    connected: false,
                    error: getErrorMessage(error, 'Failed to create live session'),
                })
                return null
            }
        },

        async attachSession(sessionId) {
            const target = sessionId.trim()
            if (!target) return

            set({ loading: true, error: null })
            try {
                const snapshot = await chatApi.attachLiveSession(target)
                activeSessionId = target
                set((state) => ({
                    loading: false,
                    connected: true,
                    liveSession: snapshot.state,
                    turns: normalizeTurns(snapshot.turns),
                    systemMessages: [],
                    currentContextTokens: normalizeNonNegativeNumber(
                        snapshot.state.currentContextTokens,
                    ),
                    contextLimit: normalizeNonNegativeNumber(snapshot.state.contextWindow),
                    contextPercent: calculateContextPercent(
                        snapshot.state.currentContextTokens ?? 0,
                        snapshot.state.contextWindow ?? 0,
                    ),
                    runtimeBadges: withRuntimeBadge(state.runtimeBadges, {
                        sessionId: target,
                        workspaceId: snapshot.state.workspaceId,
                        status: snapshot.state.status,
                        updatedAt: new Date().toISOString(),
                    }),
                }))
            } catch (error) {
                set({
                    loading: false,
                    connected: false,
                    error: getErrorMessage(error, 'Failed to attach session'),
                })
            }
        },

        async sendInput(value) {
            const sessionId = activeSessionId
            if (!sessionId) return null

            const input = value.trim()
            if (!input) return null

            set({ error: null })

            try {
                const result = await chatApi.submitSessionInput(sessionId, input)
                if (!result.accepted && result.message) {
                    set({ error: result.message })
                }
                return result
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to send chat input') })
                return null
            }
        },

        async removeQueuedInput(queueId) {
            const sessionId = activeSessionId
            if (!sessionId) return false
            const targetQueueId = queueId.trim()
            if (!targetQueueId) return false

            set({ error: null })
            try {
                const result = await chatApi.removeQueuedInput(sessionId, targetQueueId)
                return result.removed
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to remove queued message') })
                return false
            }
        },

        async sendQueuedInputNow() {
            const sessionId = activeSessionId
            if (!sessionId) return false

            set({ error: null })
            try {
                const result = await chatApi.sendQueuedInputNow(sessionId)
                return result.triggered
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to send queued message now') })
                return false
            }
        },

        async cancelCurrentTurn() {
            const sessionId = activeSessionId
            if (!sessionId) return
            try {
                await chatApi.cancelSessionTurn(sessionId)
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to cancel current turn') })
            }
        },

        async approvePendingApproval(decision) {
            const sessionId = activeSessionId
            const pendingApproval = get().liveSession?.pendingApproval
            if (!sessionId || !pendingApproval?.fingerprint) return false

            try {
                await chatApi.approveSessionAction(sessionId, pendingApproval.fingerprint, decision)
                return true
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to submit approval decision') })
                return false
            }
        },

        async compactCurrentSession() {
            const sessionId = activeSessionId
            if (!sessionId) return
            try {
                await chatApi.compactSession(sessionId)
            } catch (error) {
                set({ error: getErrorMessage(error, 'Failed to compact session') })
            }
        },

        connectStream(sessionId) {
            void get().attachSession(sessionId)
        },

        disconnectStream() {
            activeSessionId = null
            set({
                connected: false,
                currentContextTokens: 0,
                contextLimit: 0,
                contextPercent: 0,
            })
        },

        reset() {
            activeSessionId = null
            set({
                liveSession: null,
                turns: [],
                systemMessages: [],
                loading: false,
                connected: false,
                runtimeBadges: {},
                currentContextTokens: 0,
                contextLimit: 0,
                contextPercent: 0,
                error: null,
            })
        },
    }
})
