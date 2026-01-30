import { Box, Text } from 'ink'
import type { SystemMessage } from '../../types'

type SystemMessageViewProps = {
    message: SystemMessage
}

export function SystemMessageView({ message }: SystemMessageViewProps) {
    return (
        <Box flexDirection="column" gap={0}>
            <Text color="cyan">● {message.title}</Text>
            <Text color="gray">{message.content}</Text>
        </Box>
    )
}
