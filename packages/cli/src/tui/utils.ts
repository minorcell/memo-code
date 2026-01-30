import type { TokenUsage } from '@memo/core'
import stringWidth from 'string-width'
import type { ToolStatus } from './types'

type ToolCallShape = { tool: string; input?: unknown }

function isToolCallShape(value: unknown): value is ToolCallShape {
    if (!value || typeof value !== 'object') return false
    const record = value as Record<string, unknown>
    return typeof record.tool === 'string'
}

function isToolCallJson(text: string): boolean {
    try {
        const parsed = JSON.parse(text)
        return isToolCallShape(parsed)
    } catch {
        return false
    }
}

export function stripToolCallArtifacts(text: string): string {
    if (!text.trim()) return text
    let output = text

    const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/g
    output = output.replace(fencedRegex, (full, body) => {
        const candidate = typeof body === 'string' ? body.trim() : ''
        if (!candidate.startsWith('{') || !candidate.endsWith('}')) return full
        return isToolCallJson(candidate) ? '' : full
    })

    const trimmed = output.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        if (isToolCallJson(trimmed)) return ''
    }

    return output.replace(/\n{3,}/g, '\n\n').trim()
}

export function buildPaddedLine(content: string, width: number, paddingX = 1) {
    const safeWidth = Math.max(1, width)
    const padded = `${' '.repeat(paddingX)}${content}${' '.repeat(paddingX)}`
    const padding = Math.max(0, safeWidth - stringWidth(padded))
    const line = padding > 0 ? `${padded}${' '.repeat(padding)}` : padded
    return { line, blankLine: ' '.repeat(safeWidth) }
}

export function safeStringify(input: unknown): string {
    if (typeof input === 'string') return input
    try {
        const serialized = JSON.stringify(input)
        return serialized ?? String(input)
    } catch {
        return String(input)
    }
}

export function inferToolStatus(observation?: string): ToolStatus {
    if (!observation) return 'success'
    const lowered = observation.toLowerCase()
    if (lowered.includes('error') || lowered.includes('unknown') || lowered.includes('failed')) {
        return 'error'
    }
    return 'success'
}

// Estimated max context size for different models (in tokens)
const CONTEXT_LIMITS = {
    'gpt-4o-mini': 128000,
    'gpt-4o': 128000,
    'gpt-4': 8192,
    'gpt-3.5': 16384,
    'claude-3': 200000,
    claude: 200000,
    'deepseek-coder': 64000,
    'deepseek-chat': 64000,
    deepseek: 64000,
    'kimi-k2': 200000,
    kimi: 200000,
    default: 120000,
} as const

function getContextLimit(model: string): number {
    type LimitEntry = [keyof typeof CONTEXT_LIMITS, number]
    const lowerModel = model.toLowerCase()
    const candidates = (Object.entries(CONTEXT_LIMITS) as LimitEntry[]).filter(
        ([key]) => key !== 'default',
    )
    // match the most specific key first to avoid substring collisions (e.g. gpt-4 vs gpt-4o)
    for (const [key, limit] of candidates.sort((a, b) => b[0].length - a[0].length)) {
        if (lowerModel.includes(key)) return limit
    }
    return CONTEXT_LIMITS.default
}

export function calculateContextPercent(
    usageOrTokens?: TokenUsage | number,
    contextLimit?: number,
): number {
    if (usageOrTokens === undefined || usageOrTokens === null) return 0
    // Accept raw token count or TokenUsage.
    const usedTokens =
        typeof usageOrTokens === 'number'
            ? usageOrTokens
            : (usageOrTokens.prompt ?? usageOrTokens.total ?? 0)
    if (usedTokens <= 0) return 0
    const limit = contextLimit && contextLimit > 0 ? contextLimit : getContextLimit('')
    return Math.min(100, (usedTokens / limit) * 100)
}

export function formatTokenUsage(usage?: TokenUsage): string {
    if (!usage) return ''
    return `${usage.total} tokens`
}
