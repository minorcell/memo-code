import { Box, Text } from 'ink'
import { memo } from 'react'
import type { SystemMessage } from '../../types'

type SystemMessageViewProps = {
    message: SystemMessage
}

export const SystemMessageView = memo(function SystemMessageView({
    message,
}: SystemMessageViewProps) {
    return (
        <Box flexDirection="column" gap={0}>
            <Text color="cyan">● {message.title}</Text>
            <Text color="gray">{message.content}</Text>
        </Box>
    )
})
