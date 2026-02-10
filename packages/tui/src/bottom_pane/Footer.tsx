import { Box, Text } from 'ink'

type FooterProps = {
    busy: boolean
    contextPercent: number
    tokenLine?: string
}

export function Footer({ busy, contextPercent, tokenLine }: FooterProps) {
    const context = `${contextPercent.toFixed(1)}%`

    return (
        <Box justifyContent="space-between">
            <Text color="gray">
                {busy
                    ? 'Working...  Esc Esc to interrupt'
                    : 'Enter send • Shift+Enter newline • /help'}
            </Text>
            <Text color="gray">
                {tokenLine ? `${tokenLine} • ` : ''}
                context: {context}
            </Text>
        </Box>
    )
}
