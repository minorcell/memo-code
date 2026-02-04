import { Box, Text } from 'ink'
import { memo } from 'react'

type UserMessageProps = {
    text: string
}

export const UserMessage = memo(function UserMessage({ text }: UserMessageProps) {
    return (
        <Box backgroundColor="blackBright" paddingY={1}>
            <Text color="gray">› </Text>
            <Text color="white">{text}</Text>
        </Box>
    )
})
