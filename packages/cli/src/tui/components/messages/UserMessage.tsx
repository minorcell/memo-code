import { Box, Text } from 'ink'
import { memo } from 'react'

type UserMessageProps = {
    text: string
}

export const UserMessage = memo(function UserMessage({ text }: UserMessageProps) {
    return (
        <Box borderStyle="round" paddingX={1} paddingY={0}>
            <Text color="white">{text}</Text>
        </Box>
    )
})
