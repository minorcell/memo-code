/**
 * Agent 层的基础类型声明，涵盖对话消息、解析结果与依赖注入接口。
 * 每个类型尽量保持精简，方便在 UI/工具等层复用。
 */
export type Role = "system" | "user" | "assistant"

/** 模型侧的单条聊天消息。 */
export type ChatMessage = {
    role: Role
    content: string
}

/** Agent 运行得到的结果，包括最终答案与全量日志。 */
export type AgentResult = {
    answer: string
    logEntries: string[]
}

/** 将 LLM 输出解析成 action/final 结构后的表示。 */
export type ParsedAssistant = {
    action?: { tool: string; input: string }
    final?: string
}

/** 单个工具函数签名：输入字符串，返回字符串结果。 */
export type ToolFn = (input: string) => Promise<string>
/** 工具注册表，键为工具名称，值为执行函数。 */
export type ToolRegistry = Record<string, ToolFn>

/** LLM 调用接口：输入历史消息，返回模型回复文本。 */
export type CallLLM = (messages: ChatMessage[]) => Promise<string>

/**
 * runAgent 运行所需的依赖注入集合。
 * - tools: 可用的工具集合。
 * - callLLM: 具体的模型调用函数。
 * - loadPrompt: 自定义加载系统提示词。
 * - writeHistory: 自定义记录日志的实现。
 * - historyFilePath: 日志写入路径。
 * - onAssistantStep: 每轮模型输出的回调（便于流式打印）。
 */
export type AgentDeps = {
    tools: ToolRegistry
    callLLM: CallLLM
    loadPrompt?: () => Promise<string>
    writeHistory?: (logs: string[]) => Promise<void>
    historyFilePath?: string
    onAssistantStep?: (content: string, step: number) => void
}
