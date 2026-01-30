import { Box, Text } from 'ink'

type UserMessageProps = {
    text: string
}

export function UserMessage({ text }: UserMessageProps) {
    return (
        <Box
            borderStyle="round"
            paddingX={1}
            paddingY={0}
            flexDirection="column"
        >
            <Text color="white">{text}</Text>
        </Box>
    )
}

export function UserPrompt({ username, cwd }: { username: string; cwd: string }) {
    const displayName = cwd.split('/').pop() || cwd
    return (
        <Text color="white">
            <Text color="cyan">{username}</Text>
            <Text color="gray">@</Text>
            <Text color="cyan">{displayName}</Text>
            <Text color="yellow"> 💫</Text>
            <Text> </Text>
        </Text>
    )
}
