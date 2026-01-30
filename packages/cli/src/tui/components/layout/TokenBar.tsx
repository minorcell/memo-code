import { Box, Text } from 'ink'

type TokenBarProps = {
    tokenLine: string
    model?: string
    mode?: 'thinking' | 'normal'
    contextPercent?: number
}

function formatTime(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
}

export function TokenBar({
    tokenLine,
    model = 'agent',
    mode = 'normal',
    contextPercent = 0,
}: TokenBarProps) {
    const time = formatTime()
    const displayModel = model.length > 20 ? model.slice(0, 20) + '...' : model
    const displayMode = mode === 'thinking' ? 'thinking' : 'normal'
    const contextStr = contextPercent > 0 ? ` ${contextPercent.toFixed(1)}%` : ' 0.0%'

    return (
        <Box justifyContent="space-between" marginTop={1}>
            {/* Left side: Time and Agent status */}
            <Box gap={1}>
                <Text color="gray">{time}</Text>
                <Text color="gray">
                    agent ({displayModel}, {displayMode})
                </Text>
                <Text color="gray">ctrl-x: toggle mode</Text>
                <Text color="gray">ctrl-/: help</Text>
            </Box>

            {/* Right side: Context usage */}
            <Box>
                <Text color="gray">context:{contextStr}</Text>
            </Box>
        </Box>
    )
}

// Simple version for minimal display
export function SimpleTokenBar({ tokenLine }: { tokenLine: string }) {
    return (
        <Box justifyContent="flex-end">
            <Text color="gray">{tokenLine}</Text>
        </Box>
    )
}
