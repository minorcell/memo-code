import { Box, Text } from 'ink'
import { MarkdownMessage } from './MarkdownMessage'

type AssistantMessageProps = {
    text: string
    isThinking?: boolean
}

export function AssistantMessage({ text, isThinking = false }: AssistantMessageProps) {
    if (isThinking) {
        return (
            <Box flexDirection="column" flexGrow={1}>
                <MarkdownMessage text={text} tone="muted" />
            </Box>
        )
    }

    return (
        <Box flexDirection="column" flexGrow={1}>
            <MarkdownMessage text={text} tone="normal" />
        </Box>
    )
}

// Thinking/Reasoning message shown during processing
export function ThinkingMessage({ text }: { text: string }) {
    return (
        <Box>
            <Text color="gray">• {text}</Text>
        </Box>
    )
}

// Tool usage message
export function ToolUsageMessage({ toolName, fileName }: { toolName: string; fileName?: string }) {
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
}
