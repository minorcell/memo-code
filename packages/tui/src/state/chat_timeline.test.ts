import assert from 'node:assert'
import { describe, test } from 'vitest'
import { chatTimelineReducer, createInitialTimelineState } from './chat_timeline'

describe('chatTimelineReducer', () => {
    test('creates turn and appends chunks', () => {
        let state = createInitialTimelineState()

        state = chatTimelineReducer(state, {
            type: 'turn_start',
            turn: 1,
            input: 'hello',
            promptTokens: 30,
        })

        state = chatTimelineReducer(state, {
            type: 'assistant_chunk',
            turn: 1,
            step: 0,
            chunk: 'world',
        })

        const turn = state.turns[0]
        assert.ok(turn)
        assert.strictEqual(turn?.userInput, 'hello')
        assert.strictEqual(turn?.steps[0]?.assistantText, 'world')
    })

    test('writes system messages with sequence', () => {
        let state = createInitialTimelineState()

        state = chatTimelineReducer(state, {
            type: 'append_system_message',
            title: 'Info',
            content: 'hello',
        })

        assert.strictEqual(state.systemMessages.length, 1)
        assert.strictEqual(state.systemMessages[0]?.sequence, 1)
    })

    test('updates context prompt tokens at step granularity', () => {
        let state = createInitialTimelineState()

        state = chatTimelineReducer(state, {
            type: 'turn_start',
            turn: 1,
            input: 'hello',
            promptTokens: 10,
        })

        state = chatTimelineReducer(state, {
            type: 'context_usage',
            turn: 1,
            step: 0,
            promptTokens: 42,
            phase: 'step_start',
        })

        const turn = state.turns[0]
        assert.ok(turn)
        assert.strictEqual(turn?.contextPromptTokens, 42)
        assert.strictEqual(turn?.steps[0]?.contextPromptTokens, 42)
    })
})
