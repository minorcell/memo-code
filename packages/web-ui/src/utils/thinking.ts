export function stripThinkingBlocks(content: string): string {
    if (!content) return content

    let sanitized = content

    // Remove fully closed thinking blocks.
    sanitized = sanitized.replace(
        /<\s*(think|thinking)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
        '',
    )
    // Hide trailing streamed thinking content if the closing tag has not arrived yet.
    sanitized = sanitized.replace(/<\s*(think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    // Drop any leftover standalone opening/closing tags.
    sanitized = sanitized.replace(/<\s*\/?\s*(think|thinking)\b[^>]*>/gi, '')
    // Keep layout stable after block removal.
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n')

    return sanitized
}

