export type ProviderConfig = {
    name: string
    env_api_key: string
    model: string
    base_url?: string
}

export type ModelProfileOverride = {
    supports_parallel_tool_calls?: boolean
    supports_reasoning_content?: boolean
    context_window?: number
}

export type MCPServerConfig =
    | {
          type?: 'stdio'
          command: string
          args?: string[]
          env?: Record<string, string>
          stderr?: 'inherit' | 'pipe' | 'ignore'
      }
    | {
          type?: 'streamable_http'
          url: string
          headers?: Record<string, string>
          http_headers?: Record<string, string>
          bearer_token_env_var?: string
      }

export type MemoConfig = {
    current_provider: string
    model_profiles?: Record<string, ModelProfileOverride>
    mcp_servers?: Record<string, MCPServerConfig>
    active_mcp_servers?: string[]
    active_skills?: string[]
    mcp_oauth_credentials_store_mode?: 'auto' | 'keyring' | 'file'
    mcp_oauth_callback_port?: number
    auto_compact_threshold_percent?: number
    providers: ProviderConfig[]
}

export type ApiSuccessMeta = {
    requestId: string
    timestamp: string
}

export type ApiErrorInfo = {
    code: string
    message: string
    details?: unknown
}

export type ApiErrorMeta = ApiSuccessMeta & {
    path?: string
}

export type OpenApiError = ApiErrorInfo

export type ApiEnvelope<T> =
    | {
          success: true
          data: T
          meta: ApiSuccessMeta
      }
    | {
          success: false
          error: ApiErrorInfo
          meta: ApiErrorMeta
      }

export type AuthLoginRequest = {
    password: string
}

export type AuthLoginResponse = {
    accessToken: string
    expiresIn: number
}

export type SseEventEnvelope = {
    event: string
    data: unknown
    seq: number
    ts: string
}

export type TokenUsageSummary = {
    prompt: number
    completion: number
    total: number
}

export type ToolUsageSummary = {
    total: number
    success: number
    failed: number
    denied: number
    cancelled: number
}

export type SessionRuntimeStatus = 'idle' | 'running' | 'error' | 'cancelled'

export type SessionDateInfo = {
    day: string
    startedAt: string
    updatedAt: string
}

export type SessionListItem = {
    id: string
    sessionId: string
    filePath: string
    title: string
    project: string
    workspaceId: string
    cwd: string
    date: SessionDateInfo
    status: SessionRuntimeStatus
    turnCount: number
    tokenUsage: TokenUsageSummary
    toolUsage: ToolUsageSummary
}

export type SessionEventItem = {
    index: number
    ts: string
    type: string
    turn?: number
    step?: number
    role?: string
    content?: string
    meta?: Record<string, unknown>
}

export type SessionTurnStep = {
    step: number
    assistantText?: string
    thinking?: string
    action?: {
        tool: string
        input: unknown
    }
    parallelActions?: Array<{
        tool: string
        input: unknown
    }>
    observation?: string
    resultStatus?: string
}

export type SessionTurnDetail = {
    turn: number
    input?: string
    startedAt?: string
    finalText?: string
    status?: string
    errorMessage?: string
    tokenUsage?: TokenUsageSummary
    steps: SessionTurnStep[]
}

export type SessionDetail = SessionListItem & {
    summary: string
    turns: SessionTurnDetail[]
    events: SessionEventItem[]
}

export type SessionListResponse = {
    items: SessionListItem[]
    page: number
    pageSize: number
    total: number
    totalPages: number
}

export type SessionEventsResponse = {
    items: SessionEventItem[]
    nextCursor: string | null
}

export type ToolPermissionMode = 'none' | 'once' | 'full'

export type AssistantToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

export type ChatMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | {
          role: 'assistant'
          content: string
          reasoning_content?: string
          tool_calls?: AssistantToolCall[]
      }
    | { role: 'tool'; content: string; tool_call_id: string; name?: string }

export type QueuedInputItem = {
    id: string
    input: string
    createdAt: string
}

export type LiveSessionState = {
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
}

export type WsServerEvent =
    | { type: 'session.snapshot'; payload: LiveSessionState }
    | {
          type: 'turn.start'
          payload: { turn: number; input: string; promptTokens?: number }
      }
    | {
          type: 'assistant.chunk'
          payload: { turn: number; step: number; chunk: string }
      }
    | {
          type: 'context.usage'
          payload: {
              turn: number
              step: number
              phase: 'turn_start' | 'step_start' | 'post_compact'
              promptTokens: number
              contextWindow: number
              thresholdTokens: number
              usagePercent: number
          }
      }
    | {
          type: 'context.compact'
          payload: {
              turn: number
              step: number
              reason: 'auto' | 'manual'
              status: 'success' | 'failed' | 'skipped'
              beforeTokens: number
              afterTokens: number
              thresholdTokens: number
              reductionPercent: number
              summary?: string
              errorMessage?: string
          }
      }
    | {
          type: 'tool.action'
          payload: {
              turn: number
              step: number
              action: { tool: string; input: unknown }
              parallelActions?: Array<{ tool: string; input: unknown }>
              thinking?: string
          }
      }
    | {
          type: 'tool.observation'
          payload: {
              turn: number
              step: number
              observation: string
              resultStatus?: string
              parallelResultStatuses?: string[]
          }
      }
    | {
          type: 'turn.final'
          payload: {
              turn: number
              step?: number
              finalText: string
              status: string
              errorMessage?: string
              turnUsage?: TokenUsageSummary
              tokenUsage?: TokenUsageSummary
          }
      }
    | {
          type: 'approval.request'
          payload: {
              fingerprint: string
              toolName: string
              reason: string
              riskLevel: string
              params: unknown
          }
      }
    | {
          type: 'session.status'
          payload: {
              status: 'idle' | 'running' | 'closed'
          }
      }
    | {
          type: 'system.message'
          payload: {
              title: string
              content: string
              tone?: 'info' | 'warning' | 'error'
          }
      }
    | {
          type: 'error'
          payload: {
              code: string
              message: string
          }
      }

export type SkillRecord = {
    id: string
    name: string
    description: string
    scope: 'project' | 'global'
    path: string
    active: boolean
}

export type McpServerRecord = {
    name: string
    config: Record<string, unknown>
    authStatus: 'unsupported' | 'not_logged_in' | 'bearer_token' | 'oauth'
    active: boolean
}

export type WorkspaceRecord = {
    id: string
    name: string
    cwd: string
    createdAt: string
    lastUsedAt: string
}

export type WorkspaceDirEntry = {
    name: string
    path: string
    kind: 'dir'
    readable: boolean
}

export type WorkspaceFsListResult = {
    path: string
    parentPath: string | null
    items: WorkspaceDirEntry[]
}

export type SessionRuntimeBadge = {
    sessionId: string
    status: 'idle' | 'running' | 'closed'
    workspaceId: string
    updatedAt: string
}

export type FileSuggestion = {
    id: string
    path: string
    name: string
    parent?: string
    isDir: boolean
}

export type FileSuggestionRequest = {
    cwd: string
    query: string
    limit?: number
    maxDepth?: number
    maxEntries?: number
    respectGitIgnore?: boolean
    ignoreGlobs?: string[]
}

export type ConfigSnapshot = {
    configPath: string
    memoHome: string
    needsSetup: boolean
    currentProvider: string
    selectedProvider: {
        name: string
        model: string
        contextWindow: number
    }
    providers: ProviderConfig[]
    modelProfiles?: Record<string, ModelProfileOverride>
    mcpServers: Record<string, MCPServerConfig>
    activeMcpServers: string[]
    autoCompactThresholdPercent: number
}

export type UpdateConfigRequest = {
    current_provider?: string
    providers?: ProviderConfig[]
    model_profiles?: Record<string, ModelProfileOverride>
    mcp_servers?: Record<string, MCPServerConfig>
    active_mcp_servers?: string[]
    auto_compact_threshold_percent?: number
}
