import { Box, Text } from 'ink'
import type { StepView as StepViewType } from '../../types'
import { MarkdownMessage } from '../messages/MarkdownMessage'

type StepViewProps = {
    step: StepViewType
    hideAssistantText?: boolean
}

// Extract the most important parameter to display
function getMainParam(toolInput: Record<string, any> | undefined): string | undefined {
    if (!toolInput) return undefined

    // Priority order for common parameter names
    const priorityKeys = [
        'path',
        'file',
        'filename',
        'url',
        'command',
        'pattern',
        'query',
        'content',
    ]

    for (const key of priorityKeys) {
        if (toolInput[key]) {
            const value = String(toolInput[key])
            // Truncate if too long
            if (value.length > 50) {
                return value.slice(0, 47) + '...'
            }
            return value
        }
    }

    // If no priority key found, use the first string value
    for (const [key, value] of Object.entries(toolInput)) {
        if (typeof value === 'string' && key !== 'description') {
            if (value.length > 50) {
                return value.slice(0, 47) + '...'
            }
            return value
        }
    }

    return undefined
}

export function StepView({ step, hideAssistantText = false }: StepViewProps) {
    // Extract tool name and main parameter from action
    const toolName = step.action?.tool
    const toolInput = step.action?.input as Record<string, any> | undefined
    const mainParam = getMainParam(toolInput)

    return (
        <Box flexDirection="column" gap={0}>
            {/* Render thinking text as muted (gray) */}
            {step.thinking && (
                <Box>
                    <Text color="gray">• </Text>
                    <Box flexDirection="column" flexGrow={1}>
                        <MarkdownMessage text={step.thinking} tone="muted" />
                    </Box>
                </Box>
            )}

            {/* Render tool usage */}
            {toolName && (
                <Box>
                    <Text color="green">● </Text>
                    <Text color="gray">Used </Text>
                    <Text color="cyan">{toolName}</Text>
                    {mainParam && (
                        <>
                            <Text color="gray"> (</Text>
                            <Text color="cyan">{mainParam}</Text>
                            <Text color="gray">)</Text>
                        </>
                    )}
                </Box>
            )}
        </Box>
    )
}
