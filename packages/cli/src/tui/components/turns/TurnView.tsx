import { Box, Text } from 'ink'
import { memo } from 'react'
import type { TurnView as TurnViewType } from '../../types'
import { StepView } from './StepView'
import { UserMessage } from '../messages/UserMessage'
import { AssistantMessage } from '../messages/AssistantMessage'

type TurnViewProps = {
    turn: TurnViewType
}

// Custom comparison function for better memo performance
function areTurnsEqual(prevProps: TurnViewProps, nextProps: TurnViewProps): boolean {
    const prev = prevProps.turn
    const next = nextProps.turn

    // If the turn index is different, they're definitely different
    if (prev.index !== next.index) return false

    // If user input changed, re-render
    if (prev.userInput !== next.userInput) return false

    // If final text changed, re-render
    if (prev.finalText !== next.finalText) return false

    // If status changed, re-render
    if (prev.status !== next.status) return false

    // If number of steps changed, re-render
    if (prev.steps.length !== next.steps.length) return false

    // If token usage changed, re-render
    if (prev.tokenUsage?.total !== next.tokenUsage?.total) return false

    // For steps, check if they actually changed
    for (let i = 0; i < prev.steps.length; i++) {
        const prevStep = prev.steps[i]
        const nextStep = next.steps[i]
        if (!prevStep || !nextStep) return false
        if (prevStep.assistantText !== nextStep.assistantText) return false
        if (prevStep.thinking !== nextStep.thinking) return false
        if (prevStep.action?.tool !== nextStep.action?.tool) return false
    }

    // If nothing changed, don't re-render
    return true
}

export const TurnView = memo(function TurnView({ turn }: TurnViewProps) {
    const finalText = turn.finalText?.trim() ?? ''
    const shouldRenderFinal = finalText.length > 0

    return (
        <Box flexDirection="column">
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
}, areTurnsEqual)
