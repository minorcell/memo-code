import { Box, Text } from 'ink'
import {
    TOOL_STATUS,
    type SystemMessage,
    type StepView,
    type ToolStatus,
    type TurnView,
} from '../types'
import { safeStringify, truncate } from '../utils'

function statusColor(status?: ToolStatus): string {
    if (status === TOOL_STATUS.ERROR) return 'red'
    if (status === TOOL_STATUS.EXECUTING) return 'yellow'
    return 'green'
}

function mainParam(input: unknown): string | null {
    if (input === undefined || input === null) return null
    if (typeof input === 'string') return truncate(input, 70)
    if (typeof input !== 'object' || Array.isArray(input)) return truncate(String(input), 70)

    const record = input as Record<string, unknown>
    const keys = ['cmd', 'path', 'file_path', 'dir_path', 'query', 'pattern', 'url', 'content']

    for (const key of keys) {
        const raw = record[key]
        if (raw === undefined || raw === null || raw === '') continue
        return truncate(String(raw), 70)
    }

    return truncate(safeStringify(record), 70)
}

export function SystemCell({ message }: { message: SystemMessage }) {
    const color = message.tone === 'error' ? 'red' : message.tone === 'warning' ? 'yellow' : 'cyan'

    return (
        <Box flexDirection="column">
            <Text color={color}>● {message.title}</Text>
            <Text color="gray">{message.content}</Text>
        </Box>
    )
}

function StepCell({ step }: { step: StepView }) {
    const isParallel = Boolean(step.parallelActions && step.parallelActions.length > 1)

    return (
        <Box flexDirection="column">
            {step.thinking ? (
                <Box>
                    <Text color="gray">● </Text>
                    <Text color="gray">{step.thinking}</Text>
                </Box>
            ) : null}

            {isParallel
                ? step.parallelActions?.map((action, index) => (
                      <Box key={`${action.tool}-${index}`}>
                          <Text
                              color={statusColor(
                                  step.parallelToolStatuses?.[index] ?? step.toolStatus,
                              )}
                          >
                              ●{' '}
                          </Text>
                          <Text color="gray">Used </Text>
                          <Text color="cyan">{action.tool}</Text>
                          {mainParam(action.input) ? (
                              <Text color="gray"> ({mainParam(action.input)})</Text>
                          ) : null}
                      </Box>
                  ))
                : null}

            {!isParallel && step.action ? (
                <Box>
                    <Text color={statusColor(step.toolStatus)}>● </Text>
                    <Text color="gray">Used </Text>
                    <Text color="cyan">{step.action.tool}</Text>
                    {mainParam(step.action.input) ? (
                        <Text color="gray"> ({mainParam(step.action.input)})</Text>
                    ) : null}
                </Box>
            ) : null}
        </Box>
    )
}

export function TurnCell({ turn }: { turn: TurnView }) {
    return (
        <Box flexDirection="column">
            <Box>
                <Text color="gray">› </Text>
                <Text>{turn.userInput}</Text>
            </Box>

            {turn.steps.map((step) => (
                <StepCell key={`${turn.index}-${step.index}`} step={step} />
            ))}

            {turn.finalText ? (
                <Box marginTop={0}>
                    <Text>{turn.finalText}</Text>
                </Box>
            ) : null}

            {turn.status && turn.status !== 'ok' ? (
                <Text color="red">Status: {turn.status}</Text>
            ) : null}

            {turn.errorMessage ? <Text color="red">{turn.errorMessage}</Text> : null}
        </Box>
    )
}
