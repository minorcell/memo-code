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
    'gpt-4': 8192,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    claude: 200000,
    'claude-3': 200000,
    deepseek: 64000,
    'deepseek-chat': 64000,
    'deepseek-coder': 64000,
    kimi: 200000,
    'kimi-k2': 200000,
    default: 128000,
} as const

function getContextLimit(model: string): number {
    type LimitKey = keyof typeof CONTEXT_LIMITS
    const lowerModel = model.toLowerCase()
    for (const key of Object.keys(CONTEXT_LIMITS) as LimitKey[]) {
        if (lowerModel.includes(key)) return CONTEXT_LIMITS[key]
    }
    return CONTEXT_LIMITS.default
}

export function calculateContextPercent(usage?: TokenUsage): number {
    if (!usage || !usage.total) return 0
    // Estimate: use total tokens as a rough approximation of context usage
    // This is simplified - real implementation might track actual context window
    return Math.min(100, (usage.total / 128000) * 100)
}

export function formatTokenUsage(usage?: TokenUsage): string {
    if (!usage) return ''
    return `${usage.total} tokens`
}
