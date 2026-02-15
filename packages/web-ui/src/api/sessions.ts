import { wsRequest } from '@/api/ws-client'
import type {
    ListSessionsQuery,
    SessionDetail,
    SessionEventsResponse,
    SessionListResponse,
} from '@/api/types'

export function getSessions(params: ListSessionsQuery) {
    return wsRequest<SessionListResponse>('sessions.list', params)
}

export function getSessionDetail(sessionId: string) {
    return wsRequest<SessionDetail>('sessions.detail', { sessionId })
}

export function getSessionEvents(params: { sessionId: string; cursor?: string; limit?: number }) {
    return wsRequest<SessionEventsResponse>('sessions.events', params)
}

export function removeSession(sessionId: string) {
    return wsRequest<{ deleted: boolean }>('sessions.remove', { sessionId })
}
