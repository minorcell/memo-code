import type { TokenUsage } from '@memo/core'
import type { ToolActionStatus } from '@memo/tools/orchestrator'
import { TOOL_STATUS, type ToolStatus } from './types'

const TOOL_ACTION_STATUS_SUCCESS: ToolActionStatus = 'success'

export function inferToolStatus(resultStatus?: ToolActionStatus): ToolStatus {
    if (!resultStatus) return TOOL_STATUS.SUCCESS
    return resultStatus === TOOL_ACTION_STATUS_SUCCESS ? TOOL_STATUS.SUCCESS : TOOL_STATUS.ERROR
}

export function inferParallelToolStatuses(
    parallelResultStatuses?: ToolActionStatus[],
): ToolStatus[] | undefined {
    if (!parallelResultStatuses?.length) return undefined
    return parallelResultStatuses.map((status) => inferToolStatus(status))
}

export function calculateContextPercent(currentTokens: number, contextLimit: number): number {
    if (!contextLimit || contextLimit <= 0) return 0
    if (!currentTokens || currentTokens <= 0) return 0
    return Math.min(100, (currentTokens / contextLimit) * 100)
}

export function formatTokenUsage(usage?: TokenUsage): string {
    if (!usage) return ''
    return `tokens: ${usage.total} (prompt ${usage.prompt} / completion ${usage.completion})`
}

export function truncate(input: string, max = 80): string {
    if (input.length <= max) return input
    return `${input.slice(0, Math.max(0, max - 3))}...`
}

export function safeStringify(value: unknown): string {
    if (typeof value === 'string') return value
    try {
        const serialized = JSON.stringify(value)
        return serialized ?? String(value)
    } catch {
        return String(value)
    }
}
