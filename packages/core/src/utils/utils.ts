/** @file Runtime common utility functions. */

/**
 * Extract/clean text within thinking tags (<think> or <thinking>).
 * Returns text without tags and accumulated thinking content.
 */
function extractThinkingText(raw: string): { thinkingParts: string[]; cleaned: string } {
    const thinkingParts: string[] = []
    const regex = /<\s*(think|thinking)\s*>([\s\S]*?)<\/\s*\1\s*>/gi
    const cleaned = raw.replace(regex, (_full, _tag, inner) => {
        const trimmed = (inner ?? '').trim()
        if (trimmed) thinkingParts.push(trimmed)
        return trimmed
    })

    return {
        thinkingParts,
        cleaned: cleaned.trim(),
    }
}

export function buildThinking(parts: string[]): string | undefined {
    if (parts.length === 0) return undefined
    const combined = parts.join('\n')
    const { thinkingParts, cleaned } = extractThinkingText(combined)
    if (thinkingParts.length > 0) {
        return thinkingParts.join('\n\n')
    }
    return cleaned || undefined
}
