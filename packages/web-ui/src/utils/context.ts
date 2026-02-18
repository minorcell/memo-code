function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null
        const parsed = Number(trimmed)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

export function calculateContextPercent(currentTokens: unknown, contextLimit: unknown): number {
    const limit = toFiniteNumber(contextLimit)
    const tokens = toFiniteNumber(currentTokens)
    if (limit === null || limit <= 0) return 0
    if (tokens === null || tokens <= 0) return 0
    return Math.min(100, (tokens / limit) * 100)
}
