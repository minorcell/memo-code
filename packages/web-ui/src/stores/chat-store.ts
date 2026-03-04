import { create } from 'zustand'
import { chatApi, getAuthTokens, sessionsApi } from '@/api'
import { ensureValidAccessToken } from '@/api/request'
import type {
    ChatTurn,
    LiveSessionState,
    SessionDetail,
    SessionInputResult,
    SessionRuntimeBadge,
    SessionTurnStep,
} from '@/api/types'
import { useWorkspaceStore } from '@/stores/workspace-store'
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

type StoreSetter = (
    updater: Partial<ChatStore> | ((state: ChatStore) => Partial<ChatStore>),
) => void

let activeSessionId: string | null = null
let streamAbortController: AbortController | null = null
let streamReconnectTimer: number | null = null
let streamRetryDelayMs = 1000
let streamNonce = 0

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

function toTurnsFromSessionDetail(detail: SessionDetail): ChatTurn[] {
    const turns = detail.turns.map((turn) => ({
        turn: turn.turn,
        input: turn.input ?? '',
        assistant: turn.finalText ?? '',
        status: turn.status ?? 'ok',
        errorMessage: turn.errorMessage,
        steps: normalizeSteps(turn.steps),
    }))
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

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function isNotFoundError(error: unknown): boolean {
    const message = getErrorMessage(error, '').toLowerCase()
    if (!message) return false
    return (
        message.includes('session not found') ||
        message.includes('route not found') ||
        message.includes('not_found') ||
        message.includes(' 404')
    )
}

function resolveApiBaseUrl(): string {
    const configured = import.meta.env?.VITE_SERVER_BASE_URL as string | undefined
    if (!configured) return window.location.origin

    const parsed = new URL(configured, window.location.origin)
    const pathname = parsed.pathname.replace(/\/+$/g, '')
    return `${parsed.origin}${pathname}`
}

function buildApiUrl(pathname: string): string {
    const base = resolveApiBaseUrl().replace(/\/+$/g, '')
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`
    return `${base}${path}`
}

function clearReconnectTimer(): void {
    if (streamReconnectTimer === null) return
    window.clearTimeout(streamReconnectTimer)
    streamReconnectTimer = null
}

function stopSessionStream(): void {
    clearReconnectTimer()
    if (streamAbortController) {
        streamAbortController.abort()
        streamAbortController = null
    }
}

function scheduleReconnect(sessionId: string, nonce: number, set: StoreSetter): void {
    if (activeSessionId !== sessionId || streamNonce !== nonce) return
    if (streamReconnectTimer !== null) return

    const waitMs = streamRetryDelayMs
    streamReconnectTimer = window.setTimeout(() => {
        streamReconnectTimer = null
        void openSessionStream(sessionId, nonce, set)
    }, waitMs)
    streamRetryDelayMs = Math.min(10_000, Math.floor(streamRetryDelayMs * 1.8))
}

function parseSseFrame(frame: string): { event: string; data: unknown } | null {
    let eventName = ''
    const dataChunks: string[] = []

    for (const line of frame.split('\n')) {
        if (!line || line.startsWith(':')) continue

        const separator = line.indexOf(':')
        const field = separator >= 0 ? line.slice(0, separator) : line
        const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : ''

        if (field === 'event') {
            eventName = value
        } else if (field === 'data') {
            dataChunks.push(value)
        }
    }

    if (dataChunks.length === 0) return null

    const rawData = dataChunks.join('\n')
    let parsed: unknown = rawData
    try {
        parsed = JSON.parse(rawData) as unknown
    } catch {
        // Keep raw text payload when data is not JSON.
    }

    const envelope = asRecord(parsed)
    if (envelope) {
        const envelopeEvent = typeof envelope.event === 'string' ? envelope.event : eventName
        if (!envelopeEvent) return null
        return {
            event: envelopeEvent,
            data: Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : parsed,
        }
    }

    if (!eventName) return null
    return {
        event: eventName,
        data: parsed,
    }
}

function consumeSseBuffer(
    buffer: string,
    onEvent: (eventName: string, data: unknown) => void,
): string {
    let normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    while (true) {
        const boundary = normalized.indexOf('\n\n')
        if (boundary < 0) break

        const frame = normalized.slice(0, boundary)
        normalized = normalized.slice(boundary + 2)
        const parsed = parseSseFrame(frame)
        if (!parsed) continue
        onEvent(parsed.event, parsed.data)
    }

    return normalized
}

function applyStreamEvent(
    set: StoreSetter,
    sessionId: string,
    eventName: string,
    raw: unknown,
): void {
    if (sessionId !== activeSessionId) return

    if (eventName === 'session.snapshot') {
        const state = asRecord(raw) as LiveSessionState | null
        if (!state || typeof state.id !== 'string') return

        const normalizedCurrentContextTokens = normalizeNonNegativeNumber(
            state.currentContextTokens,
        )
        const normalizedContextWindow = normalizeNonNegativeNumber(state.contextWindow)
        const normalizedContextPercent = calculateContextPercent(
            normalizedCurrentContextTokens,
            normalizedContextWindow,
        )

        set((store) => ({
            connected: true,
            liveSession: state,
            error: null,
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
        return
    }

    if (eventName === 'session.status') {
        const data = asRecord(raw)
        if (!data) return
        const status = data.status
        if (status !== 'idle' && status !== 'running' && status !== 'closed') return

        set((state) => {
            const workspaceId =
                state.liveSession?.workspaceId ?? state.runtimeBadges[sessionId]?.workspaceId
            if (!workspaceId) return {}

            return {
                liveSession: state.liveSession
                    ? {
                          ...state.liveSession,
                          status,
                      }
                    : state.liveSession,
                runtimeBadges: withRuntimeBadge(state.runtimeBadges, {
                    sessionId,
                    workspaceId,
                    status,
                    updatedAt: new Date().toISOString(),
                }),
            }
        })
        return
    }

    if (eventName === 'turn.start') {
        const data = asRecord(raw)
        if (!data) return
        const turn = data.turn
        if (typeof turn !== 'number') return
        const input = typeof data.input === 'string' ? data.input : ''
        const promptTokens =
            typeof data.promptTokens === 'number' && Number.isFinite(data.promptTokens)
                ? Math.max(0, data.promptTokens)
                : undefined

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
        return
    }

    if (eventName === 'context.usage') {
        const data = asRecord(raw)
        if (!data) return
        const promptTokens = normalizeNonNegativeNumber(data.promptTokens)
        const contextWindow = normalizeNonNegativeNumber(data.contextWindow)
        const usagePercent =
            normalizePercent(data.usagePercent) ??
            calculateContextPercent(promptTokens, contextWindow)

        set({
            currentContextTokens: promptTokens,
            contextLimit: contextWindow,
            contextPercent: usagePercent,
        })
        return
    }

    if (eventName === 'context.compact') {
        const data = asRecord(raw)
        if (!data) return
        const afterTokens = normalizeNonNegativeNumber(data.afterTokens)
        set((state) => ({
            currentContextTokens: afterTokens,
            contextPercent: calculateContextPercent(afterTokens, state.contextLimit),
        }))
        return
    }

    if (eventName === 'assistant.chunk') {
        const data = asRecord(raw)
        if (!data) return
        const turn = data.turn
        const step = data.step
        const chunk = data.chunk
        if (typeof turn !== 'number' || typeof step !== 'number' || typeof chunk !== 'string') {
            return
        }

        set((state) => ({
            turns: appendTurnChunk(state.turns, turn, step, chunk),
        }))
        return
    }

    if (eventName === 'tool.action') {
        const data = asRecord(raw)
        if (!data) return
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
        return
    }

    if (eventName === 'tool.observation') {
        const data = asRecord(raw)
        if (!data) return
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
        return
    }

    if (eventName === 'turn.final') {
        const data = asRecord(raw)
        if (!data) return
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
        return
    }

    if (eventName === 'approval.request') {
        const data = asRecord(raw)
        if (!data) return

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
        return
    }

    if (eventName === 'system.message') {
        const data = asRecord(raw)
        if (!data) return

        const title = typeof data.title === 'string' ? data.title : 'System'
        const content = typeof data.content === 'string' ? data.content : ''

        set((state) => ({
            systemMessages: [...state.systemMessages, `${title}: ${content}`],
        }))
        return
    }

    if (eventName === 'error') {
        const data = asRecord(raw)
        if (!data) return

        set({
            error: typeof data.message === 'string' ? data.message : 'Chat error',
        })
    }
}

async function openSessionStream(
    sessionId: string,
    nonce: number,
    set: StoreSetter,
): Promise<void> {
    if (activeSessionId !== sessionId || streamNonce !== nonce) return
    let shouldReconnect = true

    const tokens = (await ensureValidAccessToken()) ?? getAuthTokens()
    const accessToken = tokens?.accessToken?.trim()
    if (!accessToken) {
        shouldReconnect = false
        set({
            connected: false,
            error: 'Missing access token',
        })
        return
    }
    if (activeSessionId !== sessionId || streamNonce !== nonce) return

    stopSessionStream()
    const abortController = new AbortController()
    streamAbortController = abortController

    try {
        const response = await fetch(
            buildApiUrl(`/api/chat/sessions/${encodeURIComponent(sessionId)}/events`),
            {
                method: 'GET',
                headers: {
                    Accept: 'text/event-stream',
                    Authorization: `Bearer ${accessToken}`,
                },
                signal: abortController.signal,
            },
        )

        if (response.status === 401) {
            shouldReconnect = false
            set({
                connected: false,
                error: 'Authentication expired. Please login again.',
            })
            return
        }

        if (response.status === 404) {
            shouldReconnect = false
            set({
                connected: false,
                error: 'Session not found',
            })
            return
        }

        if (!response.ok || !response.body) {
            throw new Error(`Failed to connect session stream (${response.status})`)
        }

        streamRetryDelayMs = 1000
        set({ connected: true })

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            buffer = consumeSseBuffer(buffer, (eventName, data) => {
                applyStreamEvent(set, sessionId, eventName, data)
            })
        }

        buffer += decoder.decode()
        if (buffer.trim().length > 0) {
            consumeSseBuffer(buffer, (eventName, data) => {
                applyStreamEvent(set, sessionId, eventName, data)
            })
        }
    } catch (error) {
        if (abortController.signal.aborted) return
        set({ connected: false })
        const message = getErrorMessage(error, 'Session stream interrupted')
        if (message && !message.includes('Failed to connect session stream')) {
            scheduleReconnect(sessionId, nonce, set)
            return
        }
        shouldReconnect = false
        set({ error: message })
    } finally {
        if (streamAbortController === abortController) {
            streamAbortController = null
        }
    }

    if (shouldReconnect && activeSessionId === sessionId && streamNonce === nonce) {
        set({ connected: false })
        scheduleReconnect(sessionId, nonce, set)
    }
}

function startSessionStream(sessionId: string, set: StoreSetter): void {
    clearReconnectTimer()
    streamNonce += 1
    const nonce = streamNonce
    streamRetryDelayMs = 1000
    void openSessionStream(sessionId, nonce, set)
}

function resolveWorkspaceCwd(workspaceId: string): string | null {
    const normalizedId = workspaceId.trim()
    if (!normalizedId) return null

    const workspace = useWorkspaceStore.getState().items.find((item) => item.id === normalizedId)

    return workspace?.cwd ?? null
}

export const useChatStore = create<ChatStore>((set, get) => ({
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

        const cwd = resolveWorkspaceCwd(targetWorkspaceId)
        if (!cwd) {
            set({ error: 'Selected workspace is missing or unavailable' })
            return null
        }

        set({ loading: true, error: null })
        try {
            const state = await chatApi.createLiveSession({
                cwd,
            })
            const snapshot = await chatApi.attachLiveSession(state.id)
            activeSessionId = state.id
            startSessionStream(state.id, set)
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
            startSessionStream(target, set)
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
            if (isNotFoundError(error)) {
                try {
                    const detail = await sessionsApi.getSessionDetail(target)
                    stopSessionStream()
                    activeSessionId = null
                    set({
                        loading: false,
                        connected: false,
                        liveSession: null,
                        turns: toTurnsFromSessionDetail(detail),
                        systemMessages: [],
                        currentContextTokens: 0,
                        contextLimit: 0,
                        contextPercent: 0,
                        error: null,
                    })
                    return
                } catch (detailError) {
                    set({
                        loading: false,
                        connected: false,
                        error: getErrorMessage(detailError, 'Failed to load session history'),
                    })
                    return
                }
            }

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
        const target = sessionId.trim()
        if (!target) return
        activeSessionId = target
        startSessionStream(target, set)
    },

    disconnectStream() {
        stopSessionStream()
        activeSessionId = null
        set({
            connected: false,
            currentContextTokens: 0,
            contextLimit: 0,
            contextPercent: 0,
        })
    },

    reset() {
        stopSessionStream()
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
}))
