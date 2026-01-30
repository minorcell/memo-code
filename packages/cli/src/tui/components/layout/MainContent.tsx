import { Box } from 'ink'
import type { SystemMessage, TurnView as TurnViewType } from '../../types'
import { SystemMessageView } from '../messages/SystemMessageView'
import { TurnView } from '../turns/TurnView'
import { StatusMessage } from '../messages/StatusMessage'

type MainContentProps = {
    systemMessages: SystemMessage[]
    turns: TurnViewType[]
    statusText: string
    statusKind: 'initializing' | 'running' | 'ready' | 'error'
}

export function MainContent({ systemMessages, turns, statusText, statusKind }: MainContentProps) {
    const lastTurnIndex = turns.length - 1
    return (
        <Box flexDirection="column" gap={1}>
            {systemMessages.map((message) => (
                <SystemMessageView key={message.id} message={message} />
            ))}
            {turns.map((turn, index) => (
                <TurnView
                    key={`turn-${turn.index}`}
                    turn={turn}
                    showDuration={index === lastTurnIndex}
                />
            ))}
            <StatusMessage text={statusText} kind={statusKind} />
        </Box>
    )
}
