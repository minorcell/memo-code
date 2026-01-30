import { Box, Text } from 'ink'
import type { TurnView as TurnViewType } from '../../types'
import { StepView } from './StepView'
import { UserMessage } from '../messages/UserMessage'
import { AssistantMessage } from '../messages/AssistantMessage'

type TurnViewProps = {
    turn: TurnViewType
}

export function TurnView({ turn }: TurnViewProps) {
    const finalText = turn.finalText?.trim() ?? ''
    const shouldRenderFinal = finalText.length > 0

    return (
        <Box flexDirection="column" gap={0}>
            {/* User input with border */}
            <UserMessage text={turn.userInput} />

            {/* Thinking steps - shown in muted color */}
            {turn.steps.map((step) => (
                <StepView key={`step-${turn.index}-${step.index}`} step={step} />
            ))}

            {/* Final response - shown in normal color */}
            {shouldRenderFinal ? <AssistantMessage text={finalText} isThinking={false} /> : null}

            {/* Status indicator */}
            {turn.status && turn.status !== 'ok' ? (
                <Text color="red">Status: {turn.status}</Text>
            ) : null}
        </Box>
    )
}
