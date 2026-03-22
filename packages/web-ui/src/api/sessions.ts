import { request } from '@/api/request'
import type {
    ListSessionsQuery,
    SessionDetail,
    SessionEventsResponse,
    SessionListResponse,
} from '@/api/types'

export function getSessions(params: ListSessionsQuery) {
    const { page, pageSize, sortBy, order, project, workspaceCwd, dateFrom, dateTo, q } = params

    return request<SessionListResponse>({
        method: 'GET',
        url: '/api/sessions',
        params: {
            page,
            pageSize,
            sortBy,
            order,
            project,
            workspaceCwd,
            dateFrom,
            dateTo,
            q,
        },
    })
}

export function getSessionDetail(sessionId: string) {
    return request<SessionDetail>({
        method: 'GET',
        url: `/api/sessions/${encodeURIComponent(sessionId)}`,
    })
}

export function getSessionEvents(params: { sessionId: string; cursor?: string; limit?: number }) {
    return request<SessionEventsResponse>({
        method: 'GET',
        url: `/api/sessions/${encodeURIComponent(params.sessionId)}/events`,
        params: {
            cursor: params.cursor,
            limit: params.limit,
        },
    })
}

export function removeSession(sessionId: string) {
    return request<{ deleted: boolean }>({
        method: 'DELETE',
        url: `/api/sessions/${encodeURIComponent(sessionId)}`,
    })
}
