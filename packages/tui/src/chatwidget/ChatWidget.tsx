import { memo, useMemo } from 'react'
import { Box, Static, Text } from 'ink'
import type { SystemMessage, TurnView } from '../types'
import { SystemCell, TurnCell } from './Cells'

type HeaderInfo = {
    providerName: string
    model: string
    cwd: string
    sessionId: string
    mcpNames: string[]
    version: string
}

type ChatWidgetProps = {
    header: HeaderInfo
    systemMessages: SystemMessage[]
    turns: TurnView[]
    historicalTurns: TurnView[]
}

type StaticItem =
    | { type: 'header'; data: HeaderInfo }
    | { type: 'system'; data: SystemMessage }
    | { type: 'turn'; data: TurnView }

export const ChatWidget = memo(function ChatWidget({
    header,
    systemMessages,
    turns,
    historicalTurns,
}: ChatWidgetProps) {
    const allTurns = useMemo(() => [...historicalTurns, ...turns], [historicalTurns, turns])

    const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : undefined
    const lastTurnComplete =
        lastTurn && Boolean(lastTurn.finalText || (lastTurn.status && lastTurn.status !== 'ok'))

    const completedTurns = lastTurnComplete ? allTurns : allTurns.slice(0, -1)
    const inProgressTurn = lastTurnComplete ? undefined : lastTurn

    const staticItems: StaticItem[] = [{ type: 'header', data: header }]

    const sorted = [
        ...systemMessages.map((message) => ({
            type: 'system' as const,
            sequence: message.sequence,
            data: message,
        })),
        ...completedTurns.map((turn) => ({
            type: 'turn' as const,
            sequence: turn.sequence ?? 0,
            data: turn,
        })),
    ].sort((a, b) => a.sequence - b.sequence)

    for (const item of sorted) {
        staticItems.push(item)
    }

    return (
        <Box flexDirection="column">
            <Static items={staticItems}>
                {(item) => {
                    if (item.type === 'header') {
                        return (
                            <Box
                                key="header"
                                borderStyle="round"
                                borderColor="blue"
                                paddingX={1}
                                flexDirection="column"
                            >
                                <Text bold>Memo CLI</Text>
                                <Text color="gray">
                                    {item.data.providerName} / {item.data.model} • v
                                    {item.data.version}
                                </Text>
                                <Text color="gray">cwd: {item.data.cwd}</Text>
                                <Text color="gray">
                                    mcp: {item.data.mcpNames.join(', ') || 'none'}
                                </Text>
                            </Box>
                        )
                    }

                    if (item.type === 'system') {
                        return <SystemCell key={item.data.id} message={item.data} />
                    }

                    return <TurnCell key={`turn-${item.data.index}`} turn={item.data} />
                }}
            </Static>

            {inProgressTurn ? <TurnCell turn={inProgressTurn} /> : null}
        </Box>
    )
})
