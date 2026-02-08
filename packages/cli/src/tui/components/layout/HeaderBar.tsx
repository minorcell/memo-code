import { Box, Text } from 'ink'
import { memo } from 'react'

type HeaderBarProps = {
    providerName: string
    model: string
}

export const HeaderBar = memo(function HeaderBar({ providerName, model }: HeaderBarProps) {
    return (
        <Box
            borderStyle="round"
            borderColor="blueBright"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
            gap={1}
        >
            {/* Logo and Title Row */}
            <Box gap={1} alignItems="center">
                <Box flexDirection="column">
                    <Text bold>Welcome to Memo Code CLI!</Text>
                    <Text color="gray">Send /help for help information.</Text>
                </Box>
            </Box>

            {/* Info Rows */}
            <Box flexDirection="column" gap={0}>
                <Box>
                    <Text color="gray">Model: </Text>
                    <Text color="cyan">{model}</Text>
                    <Text color="gray"> (powered by {providerName})</Text>
                </Box>
            </Box>
        </Box>
    )
})
