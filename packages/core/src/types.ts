// Agent 层类型定义

export type Role = "system" | "user" | "assistant"

export type ChatMessage = {
    role: Role
    content: string
}

export type AgentResult = {
    answer: string
    logEntries: string[]
}

export type ParsedAssistant = {
    action?: { tool: string; input: string }
    final?: string
}

export type ToolFn = (input: string) => Promise<string>
export type ToolRegistry = Record<string, ToolFn>

export type CallLLM = (messages: ChatMessage[]) => Promise<string>

export type AgentDeps = {
    tools: ToolRegistry
    callLLM: CallLLM
    loadPrompt?: () => Promise<string>
    writeHistory?: (logs: string[]) => Promise<void>
    historyFilePath?: string
    onAssistantStep?: (content: string, step: number) => void
}
