/** @file 工具审批对话框 */
import { Box, Text, useInput } from 'ink'
import { useState, useCallback } from 'react'
import type { ApprovalRequest, ApprovalDecision } from '@memo/tools/approval'

type ApprovalModalProps = {
    request: ApprovalRequest
    onDecision: (decision: ApprovalDecision) => void
}

type Option = {
    label: string
    decision: ApprovalDecision
}

function formatParams(params: unknown): string {
    if (typeof params !== 'object' || params === null) {
        return String(params)
    }
    const entries = Object.entries(params as Record<string, unknown>)
    if (entries.length === 0) return ''
    const [key, value] = entries[0]!
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
    return `${valueStr.slice(0, 40)}${valueStr.length > 40 ? '...' : ''}`
}

export function ApprovalModal({ request, onDecision }: ApprovalModalProps) {
    const options: Option[] = [
        { label: 'Allow once', decision: 'once' },
        { label: 'Allow all session', decision: 'session' },
        { label: 'Reject this time', decision: 'deny' },
    ]

    const [selectedIndex, setSelectedIndex] = useState(0)

    useInput(
        useCallback(
            (input, key) => {
                if (key.upArrow) {
                    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
                } else if (key.downArrow) {
                    setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
                } else if (key.return) {
                    onDecision(options[selectedIndex]!.decision)
                }
            },
            [selectedIndex, onDecision, options],
        ),
    )

    const paramStr = formatParams(request.params)

    return (
        <Box borderStyle="single" borderColor="gray" paddingX={2} flexDirection="column">
            <Box>
                <Text bold>Tool Approval:</Text>
            </Box>
            <Box marginTop={1}>
                <Text color="cyan">
                    {request.toolName}
                    {paramStr ? ` (${paramStr})` : ''}
                </Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
                {options.map((opt, idx) => (
                    <Box key={opt.decision}>
                        <Text color={selectedIndex === idx ? 'green' : 'gray'}>
                            {selectedIndex === idx ? '> ' : '  '}
                            {opt.label}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
    )
}
