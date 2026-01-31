import { Box, Text } from 'ink'
import { memo, useMemo } from 'react'
import { MarkdownMessage } from './MarkdownMessage'

type AssistantMessageProps = {
    text: string
    isThinking?: boolean
}

/**
 * 解析并移除 <think>/<thinking>...</think> 标签及其内容
 * 返回处理后的文本和思考内容
 */
function parseThinkTags(text: string): { content: string; thinking: string | null } {
    // 匹配思考标签（支持 <think> 与 <thinking>，多行，非贪婪）
    const thinkRegex = /<\s*(think|thinking)\s*>([\s\S]*?)<\/\s*\1\s*>/gi
    const thinkingParts: string[] = []
    let match
    let lastIndex = 0
    const matches: { start: number; end: number }[] = []

    // 找到所有匹配位置
    while ((match = thinkRegex.exec(text)) !== null) {
        matches.push({ start: match.index, end: thinkRegex.lastIndex })
        const thinkContent = match[2]?.trim()
        if (thinkContent) {
            thinkingParts.push(thinkContent)
        }
    }

    // 如果没有找到 think 标签，返回原文
    if (matches.length === 0) {
        return { content: text, thinking: null }
    }

    // 构建去除 think 标签后的内容
    let content = ''
    lastIndex = 0
    for (const { start, end } of matches) {
        content += text.slice(lastIndex, start)
        lastIndex = end
    }
    content += text.slice(lastIndex)

    // 清理多余空行
    content = content.replace(/\n{3,}/g, '\n\n').trim()

    return {
        content,
        thinking: thinkingParts.length > 0 ? thinkingParts.join('\n\n') : null,
    }
}

export const AssistantMessage = memo(function AssistantMessage({
    text,
    isThinking = false,
}: AssistantMessageProps) {
    const { content, thinking } = useMemo(() => parseThinkTags(text), [text])

    if (isThinking) {
        return (
            <Box flexDirection="column" flexGrow={1}>
                <MarkdownMessage text={text} tone="muted" />
            </Box>
        )
    }

    return (
        <Box flexDirection="column" flexGrow={1} gap={1}>
            {/* 思考内容用暗色显示 */}
            {thinking && (
                <Box flexDirection="column" paddingLeft={2}>
                    <MarkdownMessage text={thinking} tone="muted" />
                </Box>
            )}
            <MarkdownMessage text={content} tone="normal" />
        </Box>
    )
})

// Thinking/Reasoning message shown during processing
export const ThinkingMessage = memo(function ThinkingMessage({ text }: { text: string }) {
    return (
        <Box>
            <Text color="gray">• {text}</Text>
        </Box>
    )
})

// Tool usage message
export const ToolUsageMessage = memo(function ToolUsageMessage({
    toolName,
    fileName,
}: {
    toolName: string
    fileName?: string
}) {
    return (
        <Box>
            <Text color="green">● </Text>
            <Text color="gray">Used </Text>
            <Text color="cyan">{toolName}</Text>
            {fileName && (
                <>
                    <Text color="gray"> (</Text>
                    <Text color="cyan">{fileName}</Text>
                    <Text color="gray">)</Text>
                </>
            )}
        </Box>
    )
})
