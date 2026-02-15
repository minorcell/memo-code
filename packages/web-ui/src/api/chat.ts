import { wsRequest } from '@/api/ws-client'
import type {
    ChatFileSuggestionResponse,
    ChatRuntimeListResponse,
    ChatSessionSnapshot,
    ChatProviderRecord,
    LiveSessionState,
    SessionInputResult,
} from '@/api/types'

export function createLiveSession(params?: {
    providerName?: string
    workspaceId?: string
    cwd?: string
    toolPermissionMode?: 'none' | 'once' | 'full'
    activeMcpServers?: string[]
}) {
    return wsRequest<LiveSessionState>('chat.session.create', params ?? {})
}

export function listChatProviders() {
    return wsRequest<ChatProviderRecord[]>('chat.providers.list', {})
}

export function listChatRuntimes(params?: { workspaceId?: string }) {
    return wsRequest<ChatRuntimeListResponse>('chat.runtimes.list', params ?? {})
}

export function getLiveSession(sessionId: string) {
    return wsRequest<LiveSessionState>('chat.session.state', { sessionId })
}

export function attachLiveSession(sessionId: string) {
    return wsRequest<ChatSessionSnapshot>('chat.session.attach', { sessionId })
}

export function submitSessionInput(sessionId: string, input: string) {
    return wsRequest<SessionInputResult>(
        'chat.input.submit',
        { sessionId, input },
        { timeoutMs: null },
    )
}

export function cancelSessionTurn(sessionId: string) {
    return wsRequest<{ cancelled: boolean }>('chat.turn.cancel', { sessionId })
}

export function compactSession(sessionId: string) {
    return wsRequest<{ compacted: boolean; keptMessages: number }>('chat.session.compact', {
        sessionId,
    })
}

export function approveSessionAction(
    sessionId: string,
    fingerprint: string,
    decision: 'once' | 'session' | 'deny',
) {
    return wsRequest<{ recorded: boolean }>('chat.approval.respond', {
        sessionId,
        fingerprint,
        decision,
    })
}

export function suggestChatFiles(params: {
    query: string
    sessionId?: string
    workspaceId?: string
    limit?: number
}) {
    return wsRequest<ChatFileSuggestionResponse>('chat.files.suggest', params)
}
