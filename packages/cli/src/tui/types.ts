import type { TokenUsage, TurnStatus } from '@memo/core'

export type ToolStatus = 'pending' | 'executing' | 'success' | 'error'

export type StepView = {
    index: number
    assistantText: string
    thinking?: string
    action?: { tool: string; input: unknown }
    observation?: string
    toolStatus?: ToolStatus
    /** 并发调用标记：是否有多个工具同时执行 */
    isParallel?: boolean
    /** 并发调用的工具列表 */
    parallelTools?: string[]
}

export type TurnView = {
    index: number
    userInput: string
    steps: StepView[]
    status?: TurnStatus
    tokenUsage?: TokenUsage
    /** Estimated prompt/context tokens used at turn completion (single LLM call). */
    contextPromptTokens?: number
    finalText?: string
    startedAt?: number
    durationMs?: number
}

export type SystemMessage = {
    id: string
    title: string
    content: string
}
