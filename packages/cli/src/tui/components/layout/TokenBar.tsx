import { Box, Text } from 'ink'

type TokenBarProps = {
    contextPercent?: number
}

export function TokenBar({ contextPercent = 0 }: TokenBarProps) {
    const contextStr = contextPercent > 0 ? ` ${contextPercent.toFixed(1)}%` : ' 0.0%'

    return (
        <Box justifyContent="flex-end">
            {/* Right side: Context usage */}
            <Box>
                <Text color="gray">context:{contextStr}</Text>
            </Box>
        </Box>
    )
}
