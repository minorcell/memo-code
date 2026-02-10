import type { ChatMessage } from '@memo/core'
import type { StepView, TurnView } from '../types'

export type ParsedHistoryLog = {
    summary: string
    messages: ChatMessage[]
    turns: TurnView[]
    maxSequence: number
}

export function parseHistoryLog(raw: string): ParsedHistoryLog {
    const messages: ChatMessage[] = []
    const turns: TurnView[] = []
    const summaryParts: string[] = []

    const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    let currentTurn: TurnView | null = null
    let turnCount = 0
    let sequence = 0

    for (const line of lines) {
        let event: any
        try {
            event = JSON.parse(line)
        } catch {
            continue
        }

        if (!event || typeof event !== 'object') continue

        if (event.type === 'turn_start') {
            const userInput = typeof event.content === 'string' ? event.content : ''
            const index = -(turnCount + 1)
            currentTurn = {
                index,
                userInput,
                steps: [],
                status: 'ok',
                sequence: (sequence += 1),
            }
            turns.push(currentTurn)
            if (userInput) {
                messages.push({ role: 'user', content: userInput })
                summaryParts.push(`User: ${userInput}`)
            }
            turnCount += 1
            continue
        }

        if (event.type === 'assistant') {
            const assistantText = typeof event.content === 'string' ? event.content : ''
            if (assistantText) {
                messages.push({ role: 'assistant', content: assistantText })
                summaryParts.push(`Assistant: ${assistantText}`)
                if (currentTurn) {
                    const step: StepView = {
                        index: currentTurn.steps.length,
                        assistantText,
                    }
                    currentTurn.steps = [...currentTurn.steps, step]
                    currentTurn.finalText = assistantText
                }
            }
            continue
        }

        if (event.type === 'action' && currentTurn) {
            const meta = event.meta
            if (meta && typeof meta === 'object') {
                const tool = typeof meta.tool === 'string' ? meta.tool : ''
                const input = meta.input
                const thinking = typeof meta.thinking === 'string' ? meta.thinking : ''
                const toolBlocks = Array.isArray((meta as any).toolBlocks)
                    ? ((meta as any).toolBlocks as Array<{ name?: unknown; input?: unknown }>)
                    : []

                const parallelActions = toolBlocks
                    .map((block) => {
                        const name = typeof block?.name === 'string' ? block.name : ''
                        if (!name) return null
                        return { tool: name, input: block?.input }
                    })
                    .filter(Boolean) as Array<{ tool: string; input: unknown }>

                const lastStep = currentTurn.steps[currentTurn.steps.length - 1]
                if (lastStep) {
                    if (parallelActions.length > 1) {
                        lastStep.action = parallelActions[0]
                        lastStep.parallelActions = parallelActions
                    } else if (tool) {
                        lastStep.action = { tool, input }
                    }
                    if (thinking) {
                        lastStep.thinking = thinking
                    }
                }
            }
            continue
        }

        if (event.type === 'observation' && currentTurn) {
            const observation = typeof event.content === 'string' ? event.content : ''
            const lastStep = currentTurn.steps[currentTurn.steps.length - 1]
            if (lastStep) {
                lastStep.observation = observation
            }
            continue
        }
    }

    return {
        summary: summaryParts.join('\n'),
        messages,
        turns,
        maxSequence: sequence,
    }
}
