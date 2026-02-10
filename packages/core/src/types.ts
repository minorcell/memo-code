/** @file Common type declarations shared between Core and Runtime (reused by UI/Tools). */
import type { ApprovalRequest, ApprovalDecision } from '@memo/tools/approval'
import type { ToolActionStatus } from '@memo/tools/orchestrator'

/**
 * Basic type declarations for Agent layer, covering conversation messages,
 * parsing results, and dependency injection interfaces.
 * Types are kept minimal for easy reuse in UI/tools layers.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** Structured tool calls from Assistant (OpenAI tool_calls compatible format). */
export type AssistantToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

/** Model-side messages: compatible with plain text and structured tool calls/results. */
export type ChatMessage =
    | {
          /** System message. */
          role: 'system'
          /** Message content. */
          content: string
      }
    | {
          /** User message. */
          role: 'user'
          /** Message content. */
          content: string
      }
    | {
          /** Assistant text or structured tool calls. */
          role: 'assistant'
          /** Assistant text; can be empty string for pure tool calls. */
          content: string
          /** Structured tool calls list (if any). */
          tool_calls?: AssistantToolCall[]
      }
    | {
          /** Tool result message (corresponds to a tool_call). */
          role: 'tool'
          /** Tool output text. */
          content: string
          /** Corresponds to assistant.tool_calls[*].id. */
          tool_call_id: string
          /** Optional tool name for debugging. */
          name?: string
      }

/** Single-step debug record for replay and observability. */
export type AgentStepTrace = {
    /** Step index starting from 0. */
    index: number
    /** Raw assistant output for this step. */
    assistantText: string
    /** Parsed action/final structure. */
    parsed: ParsedAssistant
    /** Tool observation for this step (if any). */
    observation?: string
    /** Token statistics for this step. */
    tokenUsage: TokenUsage
}

/** Token usage statistics: prompt/completion/total. */
export type TokenUsage = {
    /** Input prompt tokens. */
    prompt: number
    /** Model generation tokens. */
    completion: number
    /** Total tokens (prompt+completion if model doesn't return it). */
    total: number
}

/** Unified tokenizer counter interface compatible with different model encodings. */
export type TokenCounter = {
    /** Actual tokenizer/encoding name used. */
    model: string
    /** Count tokens for plain text. */
    countText: (text: string) => number
    /** Count tokens for message arrays. */
    countMessages: (messages: ChatMessage[]) => number
    /** Release underlying resources. */
    dispose: () => void
}

/** Tool Use Block - tool call request */
export type ToolUseBlock = {
    type: 'tool_use'
    /** Unique ID for the tool call */
    id: string
    /** Tool name */
    name: string
    /** Tool input parameters */
    input: unknown
}

/** Text Block - text content */
export type TextBlock = {
    type: 'text'
    /** Text content */
    text: string
}

/** Content Block - can be text or tool call */
export type ContentBlock = TextBlock | ToolUseBlock

/** LLM response (unified structured content blocks). */
export type LLMResponse = {
    /** Structured content blocks (text + tool calls). */
    content: ContentBlock[]
    /** Stop reason. */
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
    /** Token usage returned by model (optional). */
    usage?: Partial<TokenUsage>
}

/** Representation of parsed LLM output as action/final structure. */
export type ParsedAssistant = {
    /** Tool to call and its parameters. */
    action?: { tool: string; input: unknown }
    /** Final answer. */
    final?: string
    /** Thinking content (when action/final is mixed with thinking text). */
    thinking?: string
}

/** Tool registry: keys are tool names, values are tool definitions. */
export type ToolRegistry = Record<string, import('@memo/tools/router/types').Tool>

/** Tool definition structure (for passing to LLM API) */
export type ToolDefinition = {
    name: string
    description: string
    input_schema: Record<string, unknown>
}

/** LLM call interface: input history messages, return structured response, can stream text via onChunk. */
export type CallLLMOptions = {
    signal?: AbortSignal
    /** Available tools list (Tool Use API mode) */
    tools?: ToolDefinition[]
}

export type CallLLM = (
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    options?: CallLLMOptions,
) => Promise<LLMResponse>

/**
 * Dependency injection collection required by runAgent.
 * - tools: Available tool collection.
 * - callLLM: Specific model call function.
 * - loadPrompt: Custom system prompt loading.
 * - onAssistantStep: Callback for each model output (for UI display).
 */
export type AgentDeps = {
    /** Map from tool names to implementations (uses default toolset if not provided). */
    tools?: ToolRegistry
    /** Model call implementation. */
    callLLM?: CallLLM
    /** System prompt loading (uses built-in default if not provided). */
    loadPrompt?: () => Promise<string>
    /** Callback for each assistant output. */
    onAssistantStep?: (content: string, step: number) => void
    /** Hook collection: inject one-time lifecycle listeners. */
    hooks?: AgentHooks
    /** Middleware list: can register multiple Hook implementations. */
    middlewares?: AgentMiddleware[]
    /** Resource cleanup callback (e.g., closing MCP Client). */
    dispose?: () => Promise<void>
    /** Request user approval for tool calls (for dangerous operations) */
    requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>
}

/** Session mode: currently only interactive is supported. */
export type SessionMode = 'interactive'
export type ToolPermissionMode = 'none' | 'once' | 'full'

/** Session-level configuration options. */
export type AgentSessionOptions = {
    /** Custom Session ID (random by default). */
    sessionId?: string
    /** Execution mode: currently only interactive. */
    mode?: SessionMode
    /** History JSONL output directory (default history/). */
    historyDir?: string
    /** Specify provider name to use. */
    providerName?: string
    /** Tokenizer encoding name, default cl100k_base. */
    tokenizerModel?: string
    /** Prompt warning threshold. */
    warnPromptTokens?: number
    /** Prompt hard limit, rejects if exceeded. */
    maxPromptTokens?: number
    /** Active MCP server names for current session (undefined means all configured servers). */
    activeMcpServers?: string[]
    /** Dangerous mode: skip approval (not equivalent to disabling sandbox). */
    dangerous?: boolean
    /** 工具权限模式：禁用工具 / 每次审批 / 全部放行。 */
    toolPermissionMode?: ToolPermissionMode
}

/** Session 运行需要的依赖（含扩展项）。 */
export type AgentSessionDeps = AgentDeps & {
    /** 历史事件 sink 列表（JSONL 等）。 */
    historySinks?: HistorySink[]
    /** 自定义 tokenizer。 */
    tokenCounter?: TokenCounter
}

/** 单轮对话的状态码。 */
export type TurnStatus = 'ok' | 'error' | 'prompt_limit' | 'cancelled'

/** 单轮对话的运行结果（含步骤与 token）。 */
export type TurnResult = {
    /** 最终输出文本。 */
    finalText: string
    /** 步骤轨迹。 */
    steps: AgentStepTrace[]
    /** 运行状态。 */
    status: TurnStatus
    /** 错误信息（若有）。 */
    errorMessage?: string
    /** 本轮 token 统计。 */
    tokenUsage: TokenUsage
}

export type TurnStartHookPayload = {
    sessionId: string
    turn: number
    input: string
    /** Estimated prompt/context tokens at turn start (includes system+history+user). */
    promptTokens?: number
    history: ChatMessage[]
}

export type ActionHookPayload = {
    sessionId: string
    turn: number
    step: number
    action: NonNullable<ParsedAssistant['action']>
    /** 并发工具调用时，包含所有工具 action（顺序与调用一致）。 */
    parallelActions?: Array<NonNullable<ParsedAssistant['action']>>
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

export type AgentHookHandler<Payload> = (payload: Payload) => Promise<void> | void

export type AgentHooks = {
    onTurnStart?: AgentHookHandler<TurnStartHookPayload>
    onAction?: AgentHookHandler<ActionHookPayload>
    onObservation?: AgentHookHandler<ObservationHookPayload>
    onFinal?: AgentHookHandler<FinalHookPayload>
    onApprovalRequest?: AgentHookHandler<ApprovalHookPayload>
    onApprovalResponse?: AgentHookHandler<ApprovalResponseHookPayload>
    onTitleGenerated?: AgentHookHandler<TitleGeneratedHookPayload>
}

export type AgentMiddleware = AgentHooks & {
    name?: string
}

/** Session 对象，持有历史并可执行多轮对话。 */
export type AgentSession = {
    /** Session 标题（LLM 生成）。 */
    title?: string
    /** Session 唯一标识。 */
    id: string
    /** 运行模式。 */
    mode: SessionMode
    /** 当前对话历史。 */
    history: ChatMessage[]
    /** 当前 Session 日志文件路径（若存在）。 */
    historyFilePath?: string
    /** 执行一轮对话。 */
    runTurn: (input: string) => Promise<TurnResult>
    /** 取消当前运行中的 turn（若支持）。 */
    cancelCurrentTurn?: (reason?: string) => void
    /** 结束 Session，释放资源。 */
    close: () => Promise<void>
}

/** 日志事件类型，用于 JSONL。 */
export type HistoryEventType =
    | 'session_start'
    | 'session_end'
    | 'turn_start'
    | 'assistant'
    | 'action'
    | 'observation'
    | 'final'
    | 'turn_end'

/** 结构化历史事件，便于 JSONL 序列化。 */
export type HistoryEvent = {
    ts: string
    sessionId: string
    turn?: number
    step?: number
    type: HistoryEventType
    /** 事件内容（如 assistant 文本、observation）。 */
    content?: string
    /** 角色（若适用）。 */
    role?: Role
    /** 额外元数据（工具名、token 等）。 */
    meta?: Record<string, unknown>
}

/** 历史落盘抽象，可输出到文件/外部系统。 */
export type HistorySink = {
    /** 写入单条事件。 */
    append: (event: HistoryEvent) => Promise<void> | void
    /** 可选：flush 持久化。 */
    flush?: () => Promise<void> | void
}
