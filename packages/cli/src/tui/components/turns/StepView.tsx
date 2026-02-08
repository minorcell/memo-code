import { Box, Text } from 'ink'
import { memo } from 'react'
import path from 'node:path'
import type { StepView as StepViewType } from '../../types'
import { MarkdownMessage } from '../messages/MarkdownMessage'

type StepViewProps = {
    step: StepViewType
    hideAssistantText?: boolean
}

const PATH_PARAM_KEYS = new Set(['dir_path', 'file_path', 'path', 'file', 'filename', 'cwd', 'dir'])

function truncate(value: string): string {
    return value.length > 50 ? `${value.slice(0, 47)}...` : value
}

function toDisplayPath(value: string, cwd: string): string {
    if (!path.isAbsolute(value)) return value

    const relative = path.relative(cwd, value)
    if (!relative) return '.'
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return value
    }

    return relative.split(path.sep).join('/')
}

// Extract the most important parameter to display
export function getMainParam(toolInput: unknown, cwd = process.cwd()): string | undefined {
    if (!toolInput) return undefined

    if (typeof toolInput === 'string') {
        return truncate(toDisplayPath(toolInput, cwd))
    }

    if (typeof toolInput !== 'object' || Array.isArray(toolInput)) return undefined

    const input = toolInput as Record<string, unknown>

    const priorityKeys = [
        'cmd',
        'dir_path',
        'file_path',
        'path',
        'file',
        'filename',
        'url',
        'command',
        'pattern',
        'include',
        'query',
        'content',
        'cwd',
        'dir',
    ]

    for (const key of priorityKeys) {
        const rawValue = input[key]
        if (rawValue === undefined || rawValue === null || rawValue === '') continue
        const value = String(rawValue)
        const displayValue =
            PATH_PARAM_KEYS.has(key) || key.includes('path') ? toDisplayPath(value, cwd) : value
        return truncate(displayValue)
    }

    for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && key !== 'description') {
            const displayValue =
                PATH_PARAM_KEYS.has(key) || key.includes('path') ? toDisplayPath(value, cwd) : value
            return truncate(displayValue)
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
    // 只比较 action 的 tool 和 input，因为显示只用这些
    if (prev.action?.tool !== next.action?.tool) return false
    if (JSON.stringify(prev.action?.input) !== JSON.stringify(next.action?.input)) return false
    if (JSON.stringify(prev.parallelActions) !== JSON.stringify(next.parallelActions)) return false
    if (prev.toolStatus !== next.toolStatus) return false

    return true
}

export const StepView = memo(function StepView({ step }: StepViewProps) {
    // 始终从 action 获取工具信息（参数不会变）
    const toolName = step.action?.tool
    const toolInput = step.action?.input as Record<string, any> | undefined
    const mainParam = getMainParam(toolInput)

    const parallelActions = step.parallelActions ?? []
    const isParallel = parallelActions.length > 1

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
                    {parallelActions.map((tool, idx) => {
                        const toolParam = getMainParam(tool.input)
                        return (
                            <Box key={idx}>
                                <Text color="green">● </Text>
                                <Text color="gray">Used </Text>
                                <Text color="cyan">{tool.tool}</Text>
                                {toolParam && (
                                    <>
                                        <Text color="gray"> (</Text>
                                        <Text color="cyan">{toolParam}</Text>
                                        <Text color="gray">)</Text>
                                    </>
                                )}
                            </Box>
                        )
                    })}
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
