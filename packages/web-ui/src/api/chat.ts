import { request } from '@/api/request'
import type {
    ChatFileSuggestionResponse,
    ChatRuntimeListResponse,
    ChatSessionSnapshot,
    ChatProviderRecord,
    LiveSessionState,
    SessionDetail,
    SessionInputResult,
} from '@/api/types'

function toChatProvider(item: {
    name: string
    model: string
    isCurrent?: boolean
}): ChatProviderRecord {
    return {
        name: item.name,
        model: item.model,
        isCurrent: item.isCurrent === true,
    }
}

function toSnapshotTurns(detail: SessionDetail | null | undefined): ChatSessionSnapshot['turns'] {
    if (!detail?.turns || !Array.isArray(detail.turns)) return []
    return detail.turns.map((turn) => ({
        turn: turn.turn,
        input: turn.input ?? '',
        assistant: turn.finalText ?? '',
        status: turn.status ?? 'ok',
        errorMessage: turn.errorMessage,
        steps: turn.steps,
    }))
}

export function createLiveSession(params?: {
    providerName?: string
    cwd?: string
    toolPermissionMode?: 'none' | 'once' | 'full'
    activeMcpServers?: string[]
}) {
    return request<LiveSessionState>({
        method: 'POST',
        url: '/api/chat/sessions',
        data: params ?? {},
    })
}

export async function listChatProviders(): Promise<ChatProviderRecord[]> {
    const response = await request<{
        items: Array<{ name: string; model: string; isCurrent?: boolean }>
    }>({
        method: 'GET',
        url: '/api/chat/sessions/providers',
    })

    return response.items.map(toChatProvider)
}

export function listChatRuntimes(params?: { workspaceCwd?: string }) {
    return request<ChatRuntimeListResponse>({
        method: 'GET',
        url: '/api/chat/runtimes',
        params: params?.workspaceCwd ? { workspaceCwd: params.workspaceCwd } : undefined,
    })
}

export function getLiveSession(sessionId: string) {
    return request<LiveSessionState>({
        method: 'GET',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    })
}

export async function attachLiveSession(sessionId: string): Promise<ChatSessionSnapshot> {
    const state = await getLiveSession(sessionId)

    let detail: SessionDetail | null = null
    try {
        detail = await request<SessionDetail>({
            method: 'GET',
            url: `/api/sessions/${encodeURIComponent(sessionId)}`,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        if (!message.includes('session not found')) {
            throw error
        }
    }

    return {
        state,
        turns: toSnapshotTurns(detail),
    }
}

export function submitSessionInput(sessionId: string, input: string) {
    return request<SessionInputResult>({
        method: 'POST',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/input`,
        data: { input },
        timeout: 0,
    })
}

export function removeQueuedInput(sessionId: string, queueId: string) {
    return request<{ removed: boolean; queued: number }>({
        method: 'DELETE',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(queueId)}`,
    })
}

export function sendQueuedInputNow(sessionId: string) {
    return request<{ triggered: boolean; queued: number }>({
        method: 'POST',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/queue/send_now`,
        data: {},
    })
}

export function cancelSessionTurn(sessionId: string) {
    return request<{ cancelled: boolean }>({
        method: 'POST',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/cancel`,
        data: {},
    })
}

export async function compactSession(sessionId: string) {
    const response = await request<{
        status: string
        keptMessages: number
    }>({
        method: 'POST',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/compact`,
        data: {},
    })

    return {
        compacted: response.status === 'success',
        keptMessages: response.keptMessages,
    }
}

export function approveSessionAction(
    sessionId: string,
    fingerprint: string,
    decision: 'once' | 'session' | 'deny',
) {
    return request<{ recorded: boolean }>({
        method: 'POST',
        url: `/api/chat/sessions/${encodeURIComponent(sessionId)}/approval`,
        data: {
            fingerprint,
            decision,
        },
    })
}

export function suggestChatFiles(params: {
    query: string
    sessionId?: string
    workspaceCwd?: string
    limit?: number
}) {
    return request<ChatFileSuggestionResponse>({
        method: 'POST',
        url: '/api/chat/files/suggest',
        data: params,
    })
}
