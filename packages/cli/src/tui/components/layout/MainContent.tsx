import { Box } from 'ink'
import type { SystemMessage, TurnView as TurnViewType } from '../../types'
import { SystemMessageView } from '../messages/SystemMessageView'
import { TurnView } from '../turns/TurnView'

type MainContentProps = {
    systemMessages: SystemMessage[]
    turns: TurnViewType[]
}

export function MainContent({ systemMessages, turns }: MainContentProps) {
    return (
        <Box flexDirection="column" gap={0}>
            {systemMessages.map((message) => (
                <SystemMessageView key={message.id} message={message} />
            ))}
            {turns.map((turn) => (
                <TurnView key={`turn-${turn.index}`} turn={turn} />
            ))}
        </Box>
    )
}
