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

type HeaderStaticItem = { type: 'header'; data: HeaderInfo }
type HistoryStaticItem = SystemMessage | TurnView
type StaticItem = HeaderStaticItem | HistoryStaticItem

function itemSequence(item: HistoryStaticItem): number {
    return item.sequence ?? 0
}

function isHeaderItem(item: StaticItem): item is HeaderStaticItem {
    return (item as HeaderStaticItem).type === 'header'
}

function isSystemItem(item: HistoryStaticItem): item is SystemMessage {
    return (item as SystemMessage).id !== undefined
}

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

    const headerItem = useMemo<HeaderStaticItem>(() => ({ type: 'header', data: header }), [header])

    const historyItems = useMemo<HistoryStaticItem[]>(() => {
        const items: HistoryStaticItem[] = [...systemMessages, ...completedTurns]
        items.sort((a, b) => itemSequence(a) - itemSequence(b))
        return items
    }, [completedTurns, systemMessages])

    const staticItems = useMemo<StaticItem[]>(
        () => [headerItem, ...historyItems],
        [headerItem, historyItems],
    )

    return (
        <Box flexDirection="column">
            <Static items={staticItems}>
                {(item) => {
                    if (isHeaderItem(item)) {
                        return (
                            <Box
                                key={`header-${item.data.sessionId}`}
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

                    if (isSystemItem(item)) {
                        return <SystemCell key={item.id} message={item} />
                    }

                    return (
                        <TurnCell
                            key={`turn-${item.sequence ?? item.index}`}
                            turn={item}
                            cwd={header.cwd}
                        />
                    )
                }}
            </Static>

            {inProgressTurn ? <TurnCell turn={inProgressTurn} cwd={header.cwd} /> : null}
        </Box>
    )
})
