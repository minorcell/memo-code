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

// Parse parallel tool calls from observation
function parseParallelTools(
    observation: string | undefined,
): Array<{ tool: string; output: string }> {
    if (!observation) return []

    const tools: Array<{ tool: string; output: string }> = []
    // 支持带下划线、连字符、点的工具名（如 mcp_server_name_tool-name）
    const regex = /\[([\w\-_.]+)\]: ([\s\S]*?)(?=\n\n\[|$)/g
    let match

    while ((match = regex.exec(observation)) !== null) {
        const output = match[2]?.trim() ?? ''
        const toolName = match[1] ?? 'unknown'
        // Extract meaningful preview (first non-empty line or first 60 chars)
        const lines = output.split('\n').filter((l) => l.trim())
        const preview = lines[0] ?? output
        tools.push({
            tool: toolName,
            output: preview.slice(0, 60) + (preview.length > 60 ? '...' : ''),
        })
    }

    return tools
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

// Extract tool info from action for display
function getToolInfo(action: { tool: string; input: unknown } | undefined): {
    toolName: string | undefined
    mainParam: string | undefined
} {
    if (!action) return { toolName: undefined, mainParam: undefined }
    return {
        toolName: action.tool,
        mainParam: getMainParam(action.input),
    }
}

export const StepView = memo(function StepView({ step, hideAssistantText = false }: StepViewProps) {
    // Extract tool name and main parameter from action
    const toolName = step.action?.tool
    const toolInput = step.action?.input as Record<string, any> | undefined
    const mainParam = getMainParam(toolInput)

    // Check if this is a parallel tool call
    const parallelTools = parseParallelTools(step.observation)
    const isParallel = parallelTools.length > 1

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

            {/* Render parallel tool usage */}
            {isParallel && (
                <>
                    {parallelTools.map((tool, idx) => (
                        <Box key={idx}>
                            <Text color="green">● </Text>
                            <Text color="gray">Used </Text>
                            <Text color="cyan">{tool.tool}</Text>
                            {tool.output && (
                                <>
                                    <Text color="gray"> (</Text>
                                    <Text color="cyan">{tool.output}</Text>
                                    <Text color="gray">)</Text>
                                </>
                            )}
                        </Box>
                    ))}
                </>
            )}

            {/* Render single tool usage */}
            {!isParallel && toolName && (
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
