/** @file Core 与 Runtime 共享的公共类型声明（会被 UI/Tools 复用）。 */
import type { ApprovalRequest, ApprovalDecision } from '@memo/tools/approval'

/**
 * Agent 层的基础类型声明，涵盖对话消息、解析结果与依赖注入接口。
 * 每个类型尽量保持精简，方便在 UI/工具等层复用。
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** Assistant 的结构化工具调用（OpenAI tool_calls 兼容形态）。 */
export type AssistantToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

/** 模型侧消息：兼容普通文本与结构化工具调用/结果。 */
export type ChatMessage =
    | {
          /** 系统消息。 */
          role: 'system'
          /** 消息正文。 */
          content: string
      }
    | {
          /** 用户消息。 */
          role: 'user'
          /** 消息正文。 */
          content: string
      }
    | {
          /** Assistant 文本或结构化工具调用。 */
          role: 'assistant'
          /** Assistant 文本；纯工具调用时允许为空字符串。 */
          content: string
          /** 结构化工具调用列表（若有）。 */
          tool_calls?: AssistantToolCall[]
      }
    | {
          /** 工具结果消息（对应某次 tool_call）。 */
          role: 'tool'
          /** 工具输出文本。 */
          content: string
          /** 对应 assistant.tool_calls[*].id。 */
          tool_call_id: string
          /** 可选工具名，便于调试。 */
          name?: string
      }

/** 单步调试记录，便于回放与可观测。 */
export type AgentStepTrace = {
    /** 步骤索引，从 0 开始。 */
    index: number
    /** 本步 assistant 的原始输出。 */
    assistantText: string
    /** 解析后的 action/final 结构。 */
    parsed: ParsedAssistant
    /** 本步对应的工具 observation（若有）。 */
    observation?: string
    /** 本步的 token 统计。 */
    tokenUsage: TokenUsage
}

/** token 统计数据，提示词/生成/总计。 */
export type TokenUsage = {
    /** 输入提示词占用的 tokens。 */
    prompt: number
    /** 模型生成部分的 tokens。 */
    completion: number
    /** 总 tokens（若模型未返回，则为 prompt+completion）。 */
    total: number
}

/** 统一的 tokenizer 计数器接口，兼容不同模型的 encoding。 */
export type TokenCounter = {
    /** 实际使用的 tokenizer/encoding 名称。 */
    model: string
    /** 计算纯文本的 tokens。 */
    countText: (text: string) => number
    /** 计算消息数组的 tokens。 */
    countMessages: (messages: ChatMessage[]) => number
    /** 释放底层资源。 */
    dispose: () => void
}

/** Tool Use Block - 工具调用请求 */
export type ToolUseBlock = {
    type: 'tool_use'
    /** 工具调用的唯一ID */
    id: string
    /** 工具名称 */
    name: string
    /** 工具输入参数 */
    input: unknown
}

/** Text Block - 文本内容 */
export type TextBlock = {
    type: 'text'
    /** 文本内容 */
    text: string
}

/** Content Block - 可以是文本或工具调用 */
export type ContentBlock = TextBlock | ToolUseBlock

/** LLM 响应（支持 Tool Use API 和传统文本模式）。 */
export type LLMResponse =
    | string
    | {
          /** 模型输出文本（传统模式）。 */
          content: string
          /** 模型返回的 token usage（可选）。 */
          usage?: Partial<TokenUsage>
          /** 若为流式增量输出，标记已通过 onChunk 传递过部分内容。 */
          streamed?: boolean
      }
    | {
          /** 结构化内容块（Tool Use API 模式）*/
          content: ContentBlock[]
          /** 停止原因 */
          stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
          /** 模型返回的 token usage（可选）。 */
          usage?: Partial<TokenUsage>
      }

/** 将 LLM 输出解析成 action/final 结构后的表示。 */
export type ParsedAssistant = {
    /** 待调用的工具及其入参。 */
    action?: { tool: string; input: unknown }
    /** 最终回答。 */
    final?: string
    /** 思考内容（当 action/final 与思考文本混合时）。 */
    thinking?: string
}

/** 工具注册表，键为工具名称，值为工具定义。 */
export type ToolRegistry = Record<string, import('@memo/tools/router/types').Tool>

/** 工具定义结构（用于传递给 LLM API）*/
export type ToolDefinition = {
    name: string
    description: string
    input_schema: Record<string, unknown>
}

/** LLM 调用接口：输入历史消息，返回模型回复文本或携带 usage，可选流式回调。 */
export type CallLLMOptions = {
    signal?: AbortSignal
    /** 可用工具列表（Tool Use API 模式）*/
    tools?: ToolDefinition[]
}

export type CallLLM = (
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    options?: CallLLMOptions,
) => Promise<LLMResponse>

/**
 * runAgent 运行所需的依赖注入集合。
 * - tools: 可用的工具集合。
 * - callLLM: 具体的模型调用函数。
 * - loadPrompt: 自定义加载系统提示词。
 * - onAssistantStep: 每轮模型输出的回调（便于流式打印）。
 */
export type AgentDeps = {
    /** 工具名称到实现的映射（未提供则使用默认工具集）。 */
    tools?: ToolRegistry
    /** 模型调用实现。 */
    callLLM?: CallLLM
    /** 系统提示词加载（不提供则用默认内置）。 */
    loadPrompt?: () => Promise<string>
    /** 每次 assistant 输出时的回调。 */
    onAssistantStep?: (content: string, step: number) => void
    /** Hook 集合：注入一次性的生命周期监听器。 */
    hooks?: AgentHooks
    /** 中间件列表：可注册多个 Hook 实现。 */
    middlewares?: AgentMiddleware[]
    /** 资源释放回调（如关闭 MCP Client）。 */
    dispose?: () => Promise<void>
    /** 请求用户审批工具调用（用于危险操作） */
    requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>
}

/** Session 模式：当前仅支持交互式。 */
export type SessionMode = 'interactive'

/** Session 级别的配置项。 */
export type AgentSessionOptions = {
    /** 自定义 Session ID（默认随机）。 */
    sessionId?: string
    /** 运行模式：当前仅支持 interactive。 */
    mode?: SessionMode
    /** 历史 JSONL 输出目录（默认 history/）。 */
    historyDir?: string
    /** 指定使用的 provider 名称。 */
    providerName?: string
    /** tokenizer encoding 名称，默认 cl100k_base。 */
    tokenizerModel?: string
    /** 提示词预警阈值。 */
    warnPromptTokens?: number
    /** 提示词硬上限，超出直接拒绝。 */
    maxPromptTokens?: number
    /** 是否启用 LLM 流式输出。 */
    stream?: boolean
    /** 危险模式：跳过审批（不等于关闭沙箱）。 */
    dangerous?: boolean
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

export type AgentHookHandler<Payload> = (payload: Payload) => Promise<void> | void

export type AgentHooks = {
    onTurnStart?: AgentHookHandler<TurnStartHookPayload>
    onAction?: AgentHookHandler<ActionHookPayload>
    onObservation?: AgentHookHandler<ObservationHookPayload>
    onFinal?: AgentHookHandler<FinalHookPayload>
    onApprovalRequest?: AgentHookHandler<ApprovalHookPayload>
    onApprovalResponse?: AgentHookHandler<ApprovalResponseHookPayload>
}

export type AgentMiddleware = AgentHooks & {
    name?: string
}

/** Session 对象，持有历史并可执行多轮对话。 */
export type AgentSession = {
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
