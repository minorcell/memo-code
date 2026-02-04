import type { TokenUsage, TurnStatus } from '@memo/core'

export type ToolStatus = 'pending' | 'executing' | 'success' | 'error'

export type StepView = {
    index: number
    assistantText: string
    thinking?: string
    action?: { tool: string; input: unknown }
    /** 并发工具调用时的全部工具信息 */
    parallelActions?: Array<{ tool: string; input: unknown }>
    observation?: string
    toolStatus?: ToolStatus
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
    /** Timeline ordering (monotonic). Set when a turn is completed. */
    sequence?: number
}

export type SystemMessage = {
    id: string
    title: string
    content: string
    /** Timeline ordering (monotonic). */
    sequence: number
}
