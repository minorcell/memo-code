import { Box, Text } from 'ink'

type FooterProps = {
    busy: boolean
    pendingApproval?: boolean
    contextPercent: number
    tokenLine?: string
}

export function Footer({ busy, pendingApproval = false, contextPercent, tokenLine }: FooterProps) {
    const context = `${contextPercent.toFixed(1)}%`
    const helpText = pendingApproval
        ? 'Approval pending • ↑/↓ select • Enter confirm • Esc deny'
        : busy
          ? 'Working...  Esc Esc to interrupt'
          : 'Enter send • Shift+Enter newline • /help'

    return (
        <Box justifyContent="space-between">
            <Text color="gray">{helpText}</Text>
            <Text color="gray">
                {tokenLine ? `${tokenLine} • ` : ''}
                context: {context}
            </Text>
        </Box>
    )
}
