import { Box, Static, Text } from 'ink'
import { memo } from 'react'
import type { SystemMessage, TurnView as TurnViewType } from '../../types'
import { SystemMessageView } from '../messages/SystemMessageView'
import { TurnView } from '../turns/TurnView'

type MainContentProps = {
    systemMessages: SystemMessage[]
    turns: TurnViewType[]
    // Add header info
    headerInfo?: {
        providerName: string
        model: string
        cwd: string
        sessionId: string
        mcpNames: string[]
        version: string
    }
}

// Custom comparison to prevent re-render when arrays haven't actually changed
function arePropsEqual(prevProps: MainContentProps, nextProps: MainContentProps): boolean {
    // Check header info (shouldn't change often)
    if (prevProps.headerInfo?.sessionId !== nextProps.headerInfo?.sessionId) return false
    if (prevProps.headerInfo?.model !== nextProps.headerInfo?.model) return false
    if (prevProps.headerInfo?.providerName !== nextProps.headerInfo?.providerName) return false
    if (prevProps.headerInfo?.cwd !== nextProps.headerInfo?.cwd) return false
    if (prevProps.headerInfo?.version !== nextProps.headerInfo?.version) return false
    if (prevProps.headerInfo?.mcpNames?.length !== nextProps.headerInfo?.mcpNames?.length) {
        return false
    }
    if (prevProps.headerInfo?.mcpNames && nextProps.headerInfo?.mcpNames) {
        const prev = prevProps.headerInfo.mcpNames
        const next = nextProps.headerInfo.mcpNames
        for (let i = 0; i < prev.length; i++) {
            if (prev[i] !== next[i]) return false
        }
    }

    // Check system messages
    if (prevProps.systemMessages.length !== nextProps.systemMessages.length) return false
    for (let i = 0; i < prevProps.systemMessages.length; i++) {
        if (prevProps.systemMessages[i]?.id !== nextProps.systemMessages[i]?.id) return false
    }

    // Check turns length
    if (prevProps.turns.length !== nextProps.turns.length) return false

    // Don't do deep comparison of turns here - let TurnView's memo handle it
    // Just check if the turn objects are the same references
    for (let i = 0; i < prevProps.turns.length; i++) {
        if (prevProps.turns[i] !== nextProps.turns[i]) {
            // Even if reference changed, TurnView's memo will do deep comparison
            return false
        }
    }

    return true
}

export const MainContent = memo(function MainContent({
    systemMessages,
    turns,
    headerInfo,
}: MainContentProps) {
    // Separate completed turns from in-progress turn
    // The last turn might be in progress, all previous ones are complete
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : undefined

    // Check if the last turn is actually complete
    const isLastTurnComplete =
        lastTurn && (lastTurn.finalText || (lastTurn.status && lastTurn.status !== 'ok'))

    // All completed turns (including last turn if it's complete)
    const allCompletedTurns = isLastTurnComplete ? turns : turns.slice(0, -1)
    const inProgressTurn = isLastTurnComplete ? undefined : lastTurn

    // Create a combined list of all static items (header + timeline events)
    type StaticItem =
        | { type: 'header'; data: typeof headerInfo }
        | { type: 'system'; data: SystemMessage }
        | { type: 'turn'; data: TurnViewType }

    const staticItems: StaticItem[] = []

    // Add header
    if (headerInfo) {
        staticItems.push({ type: 'header', data: headerInfo })
    }

    const timelineItems: Array<{ sequence: number; item: StaticItem }> = []

    for (const msg of systemMessages) {
        timelineItems.push({ sequence: msg.sequence, item: { type: 'system', data: msg } })
    }

    for (const turn of allCompletedTurns) {
        const sequence = turn.sequence ?? 0
        timelineItems.push({ sequence, item: { type: 'turn', data: turn } })
    }

    timelineItems.sort((a, b) => a.sequence - b.sequence)

    for (const entry of timelineItems) {
        staticItems.push(entry.item)
    }

    return (
        <Box flexDirection="column" gap={0}>
            {/* All completed content in a single Static block */}
            <Static items={staticItems}>
                {(item) => {
                    if (item.type === 'header' && item.data) {
                        const header = item.data
                        return (
                            <Box
                                key="header"
                                borderStyle="round"
                                borderColor="blueBright"
                                paddingX={2}
                                paddingY={1}
                                flexDirection="column"
                                gap={1}
                            >
                                <Box gap={1} alignItems="center">
                                    <Box flexDirection="column">
                                        <Text bold>Welcome to Memo Code CLI!</Text>
                                        <Text color="gray">Send /help for help information.</Text>
                                    </Box>
                                </Box>
                                <Box flexDirection="column" gap={0}>
                                    <Box>
                                        <Text color="gray">Model: </Text>
                                        <Text color="cyan">{header.model}</Text>
                                        <Text color="gray">
                                            {' '}
                                            (powered by {header.providerName})
                                        </Text>
                                    </Box>
                                    <Box>
                                        <Text color="gray">Version: </Text>
                                        <Text color="cyan">v{header.version}</Text>
                                    </Box>
                                    <Box>
                                        <Text color="gray">MCP: </Text>
                                        <Text color="cyan">
                                            {header.mcpNames.length > 0
                                                ? header.mcpNames.join(', ')
                                                : 'none'}
                                        </Text>
                                    </Box>
                                </Box>
                            </Box>
                        )
                    }

                    if (item.type === 'system') {
                        return <SystemMessageView key={item.data.id} message={item.data} />
                    }

                    if (item.type === 'turn') {
                        return <TurnView key={`turn-${item.data.index}`} turn={item.data} />
                    }

                    return null
                }}
            </Static>

            {/* In-progress turn - renders normally so it can update */}
            {inProgressTurn && (
                <TurnView key={`turn-live-${inProgressTurn.index}`} turn={inProgressTurn} />
            )}
        </Box>
    )
}, arePropsEqual)
