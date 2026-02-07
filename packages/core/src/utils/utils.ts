/** @file Runtime 公用辅助函数集合。 */

/**
 * 提取/清理思考标签（<think> 或 <thinking>）内的文本。
 * 返回去除标签后的文本以及累积的思考内容。
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
