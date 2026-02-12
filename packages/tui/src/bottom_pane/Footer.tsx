import { memo } from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'

type FooterProps = {
    busy: boolean
    pendingApproval?: boolean
    contextPercent: number
    tokenLine?: string
}

export const Footer = memo(function Footer({
    busy,
    pendingApproval = false,
    contextPercent,
    tokenLine,
}: FooterProps) {
    const context = `${contextPercent.toFixed(1)}%`
    const helpText = pendingApproval
        ? 'Approval pending • Enter confirm • Esc deny'
        : 'Enter send • Shift+Enter newline • /help'

    return (
        <Box justifyContent="space-between">
            <Box>
                {busy ? <Spinner label="Working..." /> : <Text color="gray">{helpText}</Text>}
            </Box>
            <Text color="gray">
                {tokenLine ? `${tokenLine} • ` : ''}
                context: {context}
            </Text>
        </Box>
    )
})
