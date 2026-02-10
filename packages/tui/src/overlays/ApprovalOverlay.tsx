import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ApprovalDecision, ApprovalRequest } from '@memo/tools/approval'

type ApprovalOverlayProps = {
    request: ApprovalRequest
    onDecision: (decision: ApprovalDecision) => void
}

type Option = {
    label: string
    decision: ApprovalDecision
}

const OPTIONS: Option[] = [
    { label: 'Allow once', decision: 'once' },
    { label: 'Allow for this session', decision: 'session' },
    { label: 'Deny', decision: 'deny' },
]

function shortParam(params: unknown): string {
    if (!params) return ''
    if (typeof params !== 'object') return String(params)
    const entries = Object.entries(params as Record<string, unknown>)
    if (!entries.length) return ''
    const [key, value] = entries[0] ?? []
    if (!key) return ''
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    return `${key}=${raw?.slice(0, 60) ?? ''}${raw && raw.length > 60 ? '...' : ''}`
}

export function ApprovalOverlay({ request, onDecision }: ApprovalOverlayProps) {
    const [selected, setSelected] = useState(0)

    useInput((input, key) => {
        if (key.upArrow) {
            setSelected((prev) => (prev <= 0 ? OPTIONS.length - 1 : prev - 1))
            return
        }

        if (key.downArrow) {
            setSelected((prev) => (prev + 1) % OPTIONS.length)
            return
        }

        if (key.return) {
            const option = OPTIONS[selected]
            if (option) {
                onDecision(option.decision)
            }
            return
        }

        if (key.escape || (key.ctrl && input === 'c')) {
            onDecision('deny')
        }
    })

    const param = shortParam(request.params)

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text bold color="yellow">
                Tool Approval Required
            </Text>
            <Text>
                {request.toolName}
                {param ? ` (${param})` : ''}
            </Text>
            <Text color="gray">{request.reason}</Text>
            <Box marginTop={1} flexDirection="column">
                {OPTIONS.map((option, index) => (
                    <Text key={option.decision} color={selected === index ? 'green' : 'gray'}>
                        {selected === index ? '> ' : '  '}
                        {option.label}
                    </Text>
                ))}
            </Box>
        </Box>
    )
}
