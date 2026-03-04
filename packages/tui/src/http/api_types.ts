import type { ApprovalDecision, ApprovalRequest } from '@memo/tools/approval'
import type { ToolActionStatus } from '@memo/tools/orchestrator'
import type {
    ChatMessage,
    TokenUsageSummary,
    ToolPermissionMode,
    SessionTurnDetail,
    SessionTurnStep,
} from '@memo-code/types'

export type * from '@memo-code/types'

export type SessionMode = 'interactive'
export type TurnStatus = 'ok' | 'error' | 'prompt_limit' | 'cancelled'
export type ContextUsagePhase = 'turn_start' | 'step_start' | 'post_compact'
export type CompactReason = 'auto' | 'manual'
export type CompactStatus = 'success' | 'failed' | 'skipped'

export type TokenUsage = TokenUsageSummary

export type ToolAction = {
    tool: string
    input: unknown
}

export type AgentStepTrace = {
    index: number
    assistantText: string
    parsed: {
        action?: ToolAction
        final?: string
        thinking?: string
    }
    observation?: string
    tokenUsage: TokenUsage
}

export type CompactResult = {
    reason: CompactReason
    status: CompactStatus
    beforeTokens: number
    afterTokens: number
    thresholdTokens: number
    reductionPercent: number
    summary?: string
    errorMessage?: string
}

export type TurnResult = {
    finalText: string
    steps: AgentStepTrace[]
    status: TurnStatus
    errorMessage?: string
    tokenUsage: TokenUsage
}

export type AgentSessionOptions = {
    sessionId?: string
    mode?: SessionMode
    historyDir?: string
    providerName?: string
    tokenizerModel?: string
    cwd?: string
    warnPromptTokens?: number
    contextWindow?: number
    autoCompactThresholdPercent?: number
    activeMcpServers?: string[]
    dangerous?: boolean
    toolPermissionMode?: ToolPermissionMode
}

export type TurnStartHookPayload = {
    sessionId: string
    turn: number
    input: string
    promptTokens?: number
    history: ChatMessage[]
}

export type ActionHookPayload = {
    sessionId: string
    turn: number
    step: number
    action: ToolAction
    parallelActions?: ToolAction[]
    thinking?: string
    history: ChatMessage[]
}

export type ObservationHookPayload = {
    sessionId: string
    turn: number
    step: number
    tool: string
    observation: string
    resultStatus?: ToolActionStatus
    parallelResultStatuses?: ToolActionStatus[]
    history: ChatMessage[]
}

export type FinalHookPayload = {
    sessionId: string
    turn: number
    step?: number
    finalText: string
    status: TurnStatus
    errorMessage?: string
    tokenUsage?: TokenUsage
    turnUsage: TokenUsage
    steps: AgentStepTrace[]
}

export type ContextUsageHookPayload = {
    sessionId: string
    turn: number
    step: number
    promptTokens: number
    contextWindow: number
    thresholdTokens: number
    usagePercent: number
    phase: ContextUsagePhase
}

export type ContextCompactedHookPayload = {
    sessionId: string
    turn: number
    step: number
    reason: CompactReason
    status: CompactStatus
    beforeTokens: number
    afterTokens: number
    thresholdTokens: number
    reductionPercent: number
    summary?: string
    errorMessage?: string
}

export type ApprovalHookPayload = {
    sessionId: string
    turn: number
    step: number
    request: ApprovalRequest
}

export type ApprovalResponseHookPayload = {
    sessionId: string
    turn: number
    step: number
    fingerprint: string
    decision: ApprovalDecision
}

export type TitleGeneratedHookPayload = {
    sessionId: string
    turn: number
    title: string
    originalPrompt: string
}

export type AgentHooks = {
    onTurnStart?: (payload: TurnStartHookPayload) => Promise<void> | void
    onContextUsage?: (payload: ContextUsageHookPayload) => Promise<void> | void
    onContextCompacted?: (payload: ContextCompactedHookPayload) => Promise<void> | void
    onAction?: (payload: ActionHookPayload) => Promise<void> | void
    onObservation?: (payload: ObservationHookPayload) => Promise<void> | void
    onFinal?: (payload: FinalHookPayload) => Promise<void> | void
    onApprovalRequest?: (payload: ApprovalHookPayload) => Promise<void> | void
    onApprovalResponse?: (payload: ApprovalResponseHookPayload) => Promise<void> | void
    onTitleGenerated?: (payload: TitleGeneratedHookPayload) => Promise<void> | void
}

export type AgentSessionDeps = {
    onAssistantStep?: (content: string, step: number) => void
    hooks?: AgentHooks
    requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>
}

export type AgentSession = {
    title?: string
    id: string
    mode: SessionMode
    history: ChatMessage[]
    historyFilePath?: string
    runTurn: (input: string) => Promise<TurnResult>
    cancelCurrentTurn?: (reason?: string) => void
    listToolNames?: () => string[]
    compactHistory: (reason?: CompactReason) => Promise<CompactResult>
    close: () => Promise<void>
}

export type ParsedSessionTurnDetail = SessionTurnDetail
export type ParsedSessionTurnStep = SessionTurnStep
