import type {
    ApiEnvelope as CoreApiEnvelope,
    FileSuggestion as CoreFileSuggestion,
    LiveSessionState as CoreLiveSessionState,
    McpServerRecord as CoreMcpServerRecord,
    QueuedInputItem as CoreQueuedInputItem,
    SessionDateInfo as CoreSessionDateInfo,
    SessionDetail as CoreSessionDetail,
    SessionEventItem as CoreSessionEventItem,
    SessionEventsResponse as CoreSessionEventsResponse,
    SessionListItem as CoreSessionListItem,
    SessionListResponse as CoreSessionListResponse,
    SessionRuntimeBadge as CoreSessionRuntimeBadge,
    SessionRuntimeStatus as CoreSessionRuntimeStatus,
    SessionTurnDetail as CoreSessionTurnDetail,
    SessionTurnStep as CoreSessionTurnStep,
    SkillRecord as CoreSkillRecord,
    TokenUsageSummary as CoreTokenUsageSummary,
    ToolUsageSummary as CoreToolUsageSummary,
    WorkspaceDirEntry as CoreWorkspaceDirEntry,
    WorkspaceFsListResult as CoreWorkspaceFsListResult,
    WorkspaceRecord as CoreWorkspaceRecord,
    WsServerEvent as CoreWsServerEvent,
} from '@memo-code/core'

export type ApiMeta = {
    requestId: string
    timestamp: string
}

export type ApiError = {
    code: string
    message: string
    details?: unknown
}

export type ApiEnvelope<T> = CoreApiEnvelope<T>

export type AuthTokenPair = {
    tokenType: 'Bearer'
    accessToken: string
    refreshToken: string
    accessTokenExpiresIn: number
    refreshTokenExpiresIn: number
}

export type TokenState = {
    accessToken: string
    refreshToken: string
    accessTokenExpiresAt?: number
    refreshTokenExpiresAt?: number
}

export type TokenUsageSummary = CoreTokenUsageSummary
export type ToolUsageSummary = CoreToolUsageSummary
export type SessionRuntimeStatus = CoreSessionRuntimeStatus
export type SessionDateInfo = CoreSessionDateInfo
export type SessionEventItem = CoreSessionEventItem
export type SessionTurnStep = CoreSessionTurnStep
export type SessionTurnDetail = CoreSessionTurnDetail
export type SessionListItem = CoreSessionListItem
export type SessionSummary = CoreSessionListItem
export type SessionDetail = CoreSessionDetail
export type SessionListResponse = CoreSessionListResponse
export type SessionEventsResponse = CoreSessionEventsResponse
export type LiveSessionState = CoreLiveSessionState
export type WorkspaceRecord = CoreWorkspaceRecord
export type WorkspaceDirEntry = CoreWorkspaceDirEntry
export type WorkspaceFsListResult = CoreWorkspaceFsListResult
export type SessionRuntimeBadge = CoreSessionRuntimeBadge
export type SkillRecord = CoreSkillRecord
export type McpServerRecord = CoreMcpServerRecord
export type FileSuggestion = CoreFileSuggestion
export type QueuedInputItem = CoreQueuedInputItem

export type ListSessionsQuery = {
    page?: number
    pageSize?: number
    sortBy?: 'updatedAt' | 'startedAt' | 'project' | 'title'
    order?: 'asc' | 'desc'
    project?: string
    workspaceId?: string
    dateFrom?: string
    dateTo?: string
    q?: string
}

export type ChatProviderRecord = {
    name: string
    model: string
    isCurrent: boolean
}

export type ChatTurn = {
    turn: number
    input: string
    assistant: string
    status: string
    errorMessage?: string
    steps: SessionTurnStep[]
}

export type ChatSessionSnapshot = {
    state: LiveSessionState
    turns: ChatTurn[]
}

export type ChatRuntimeListResponse = {
    items: SessionRuntimeBadge[]
}

export type ChatFileSuggestionResponse = {
    items: FileSuggestion[]
}

export type SessionInputResult = {
    accepted: boolean
    kind: 'turn' | 'command'
    status: 'ok' | 'error' | 'cancelled'
    message?: string
}

export type WsRpcResponse<T = unknown> =
    | {
          id: string
          type: 'rpc.response'
          ok: true
          data: T
      }
    | {
          id: string
          type: 'rpc.response'
          ok: false
          error: {
              code: string
              message: string
              details?: unknown
          }
      }

export type WsEventFrame<T = unknown> = {
    type: 'event'
    topic: string
    data: T
    seq: number
    ts: string
}

export type WsServerEvent =
    | CoreWsServerEvent
    | {
          type: 'runtime.status'
          payload: SessionRuntimeBadge
      }
    | {
          type: 'workspace.changed'
          payload: unknown
      }

export type McpServerConfig = Record<string, unknown>

export type SkillDetail = {
    id: string
    path: string
    name: string
    description: string
    content: string
}
