import { Box, Text } from 'ink'
import { memo } from 'react'
import type { StepView as StepViewType } from '../../types'
import { MarkdownMessage } from '../messages/MarkdownMessage'

type StepViewProps = {
    step: StepViewType
    hideAssistantText?: boolean
}

// Extract the most important parameter to display
function getMainParam(toolInput: unknown): string | undefined {
    if (!toolInput) return undefined
    
    // Handle string input (e.g., raw command)
    if (typeof toolInput === 'string') {
        if (toolInput.length > 50) {
            return toolInput.slice(0, 47) + '...'
        }
        return toolInput
    }
    
    // Must be an object to proceed
    if (typeof toolInput !== 'object' || Array.isArray(toolInput)) return undefined
    
    const input = toolInput as Record<string, any>

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
        if (input[key]) {
            const value = String(input[key])
            // Truncate if too long
            if (value.length > 50) {
                return value.slice(0, 47) + '...'
            }
            return value
        }
    }

    // If no priority key found, use the first string value
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && key !== 'description') {
            if (value.length > 50) {
                return value.slice(0, 47) + '...'
            }
            return value
        }
    }

    return undefined
}

// Custom comparison for step memo
function areStepsEqual(prevProps: StepViewProps, nextProps: StepViewProps): boolean {
    const prev = prevProps.step
    const next = nextProps.step

    if (prev.index !== next.index) return false
    if (prev.assistantText !== next.assistantText) return false
    if (prev.thinking !== next.thinking) return false
    if (prev.action?.tool !== next.action?.tool) return false
    if (prev.observation !== next.observation) return false
    if (prev.toolStatus !== next.toolStatus) return false

    return true
}

export const StepView = memo(function StepView({ step, hideAssistantText = false }: StepViewProps) {
    // Extract tool name and main parameter from action
    const toolName = step.action?.tool
    const toolInput = step.action?.input as Record<string, any> | undefined
    const mainParam = getMainParam(toolInput)

    return (
        <Box flexDirection="column" gap={0}>
            {/* Render thinking text as muted (gray) */}
            {step.thinking && (
                <Box>
                    <Text color="gray">● </Text>
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
}, areStepsEqual)
