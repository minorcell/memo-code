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

    if (typeof toolInput === 'string') {
        if (toolInput.length > 50) {
            return toolInput.slice(0, 47) + '...'
        }
        return toolInput
    }

    if (typeof toolInput !== 'object' || Array.isArray(toolInput)) return undefined

    const input = toolInput as Record<string, any>

    const priorityKeys = ['path', 'file', 'filename', 'url', 'command', 'pattern', 'query', 'content']

    for (const key of priorityKeys) {
        if (input[key]) {
            const value = String(input[key])
            if (value.length > 50) {
                return value.slice(0, 47) + '...'
            }
            return value
        }
    }

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
    const regex = /\[([\w\-_.]+)\]: ([\s\S]*?)(?=\n\n\[|$)/g
    let match

    while ((match = regex.exec(observation)) !== null) {
        const output = match[2]?.trim() ?? ''
        const toolName = match[1] ?? 'unknown'
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
    // 只比较 action 的 tool 和 input，因为显示只用这些
    if (prev.action?.tool !== next.action?.tool) return false
    if (JSON.stringify(prev.action?.input) !== JSON.stringify(next.action?.input)) return false
    if (prev.toolStatus !== next.toolStatus) return false

    return true
}

export const StepView = memo(function StepView({ step }: StepViewProps) {
    // 始终从 action 获取工具信息（参数不会变）
    const toolName = step.action?.tool
    const toolInput = step.action?.input as Record<string, any> | undefined
    const mainParam = getMainParam(toolInput)

    // 检查是否是真正的并行调用（需要多个工具）
    const parallelTools = parseParallelTools(step.observation)
    // 只有明确标记为并行，或有多个工具时，才用并行模式显示
    const isParallel = parallelTools.length > 1

    return (
        <Box flexDirection="column" gap={0}>
            {/* Render thinking text */}
            {step.thinking && (
                <Box>
                    <Text color="gray">● </Text>
                    <Box flexDirection="column" flexGrow={1}>
                        <MarkdownMessage text={step.thinking} tone="muted" />
                    </Box>
                </Box>
            )}

            {/* 并行工具调用 - 显示多个工具 */}
            {isParallel && (
                <>
                    {parallelTools.map((tool, idx) => (
                        <Box key={idx}>
                            <Text color="green">● </Text>
                            <Text color="gray">Used </Text>
                            <Text color="cyan">{tool.tool}</Text>
                            <Text color="gray"> (</Text>
                            <Text color="cyan">{tool.output}</Text>
                            <Text color="gray">)</Text>
                        </Box>
                    ))}
                </>
            )}

            {/* 单工具调用 - 始终显示 action 中的参数，不显示 observation 内容 */}
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
