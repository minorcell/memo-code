import { Box, Text } from 'ink'
import { memo } from 'react'

type TokenBarProps = {
    contextPercent?: number
}

export const TokenBar = memo(function TokenBar({ contextPercent = 0 }: TokenBarProps) {
    const contextStr = contextPercent > 0 ? ` ${contextPercent.toFixed(1)}%` : ' 0.0%'

    return (
        <Box justifyContent="flex-end">
            <Box marginTop={8}>
                <Text color="gray">context:{contextStr}</Text>
            </Box>
        </Box>
    )
})
