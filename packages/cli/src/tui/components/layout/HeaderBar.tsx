import { Box, Text } from 'ink'
import os from 'node:os'

type HeaderBarProps = {
    providerName: string
    model: string
    cwd: string
    sessionId?: string
}

function formatCwd(cwd: string) {
    const home = os.homedir()
    if (!home) return cwd
    return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

function formatSessionId(id: string | undefined): string {
    if (!id) return 'N/A'
    // Show first 8 chars and last 4 chars
    if (id.length > 16) {
        return `${id.slice(0, 8)}...${id.slice(-4)}`
    }
    return id
}

export function HeaderBar({ providerName, model, cwd, sessionId }: HeaderBarProps) {
    const displayCwd = formatCwd(cwd)
    const displaySession = formatSessionId(sessionId)

    return (
        <Box
            borderStyle="single"
            borderColor="blue"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
            gap={1}
        >
            {/* Logo and Title Row */}
            <Box gap={1} alignItems="center">
                <Box paddingX={1} {...({ backgroundColor: 'blue' } as any)}>
                    <Text bold color="white">
                        M
                    </Text>
                </Box>
                <Box flexDirection="column">
                    <Text bold>Welcome to Memo CLI!</Text>
                    <Text color="gray">Send /help for help information.</Text>
                </Box>
            </Box>

            {/* Info Rows */}
            <Box flexDirection="column" gap={0}>
                <Box>
                    <Text color="gray">Directory: </Text>
                    <Text color="cyan">{displayCwd}</Text>
                </Box>
                <Box>
                    <Text color="gray">Session: </Text>
                    <Text color="cyan">{displaySession}</Text>
                </Box>
                <Box>
                    <Text color="gray">Model: </Text>
                    <Text color="cyan">{model}</Text>
                    <Text color="gray"> (powered by {providerName})</Text>
                </Box>
            </Box>
        </Box>
    )
}
