/** @file Session Hook & Middleware 行为测试。 */
import assert from 'node:assert'
import { describe, test } from 'vitest'
import { createAgentSession, createTokenCounter } from '@memo/core'
import type { HistoryEvent, LLMResponse } from '@memo/core'
import type { Tool } from '@memo/tools/router'

const echoTool: Tool = {
    name: 'echo',
    description: 'echo input',
    source: 'native',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    execute: async (input: unknown) => {
        const { text } = input as { text: string }
        return {
            content: [{ type: 'text' as const, text: `echo:${text}` }],
        }
    },
}

function toolUseResponse(id: string, name: string, input: unknown, text?: string): LLMResponse {
    return {
        content: [
            ...(text ? [{ type: 'text' as const, text }] : []),
            {
                type: 'tool_use' as const,
                id,
                name,
                input,
            },
        ],
        stop_reason: 'tool_use',
    }
}

function endTurnResponse(text: string = 'done'): LLMResponse {
    return {
        content: [{ type: 'text' as const, text }],
        stop_reason: 'end_turn',
    }
}

describe('session hooks & middleware', () => {
    test('invokes hooks and middlewares in order', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'foo' }),
            endTurnResponse('done'),
        ]
        const hookLog: string[] = []
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                // 自动批准所有工具调用
                requestApproval: async () => 'once',
                hooks: {
                    onTurnStart: ({ turn }) => {
                        hookLog.push(`hook:start:${turn}`)
                    },
                    onAction: ({ step, action }) => {
                        hookLog.push(`hook:action:${step}:${action.tool}`)
                    },
                    onObservation: ({ step, tool, observation }) => {
                        hookLog.push(`hook:obs:${step}:${tool}:${observation}`)
                    },
                    onFinal: ({ status, finalText }) => {
                        hookLog.push(`hook:final:${status}:${finalText}`)
                    },
                },
                middlewares: [
                    {
                        onTurnStart: ({ turn }) => {
                            hookLog.push(`mw:start:${turn}`)
                        },
                        onAction: ({ step, action }) => {
                            hookLog.push(`mw:action:${step}:${action.tool}`)
                        },
                        onObservation: ({ step, tool, observation }) => {
                            hookLog.push(`mw:obs:${step}:${tool}:${observation}`)
                        },
                        onFinal: ({ status, finalText }) => {
                            hookLog.push(`mw:final:${status}:${finalText}`)
                        },
                    },
                ],
            },
            {},
        )
        try {
            const result = await session.runTurn('question')
            assert.strictEqual(result.finalText, 'done')
            assert.deepStrictEqual(hookLog, [
                'hook:start:1',
                'mw:start:1',
                'hook:action:0:echo',
                'mw:action:0:echo',
                'hook:obs:0:echo:echo:foo',
                'mw:obs:0:echo:echo:foo',
                'hook:final:ok:done',
                'mw:final:ok:done',
            ])
        } finally {
            await session.close()
        }
    })

    test('executes action from structured tool_use with accompanying text', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'hi' }, '<think>demo</think>'),
            endTurnResponse('done'),
        ]
        const hookLog: string[] = []
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                // 自动批准所有工具调用
                requestApproval: async () => 'once',
                hooks: {
                    onAction: ({ action }) => {
                        hookLog.push(`action:${action.tool}`)
                    },
                    onFinal: ({ finalText }) => {
                        hookLog.push(`final:${finalText}`)
                    },
                },
            },
            {},
        )
        try {
            const result = await session.runTurn('hi')
            assert.strictEqual(result.finalText, 'done')
            assert.deepStrictEqual(hookLog, ['action:echo', 'final:done'])
        } finally {
            await session.close()
        }
    })

    test('warns after three identical tool calls', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('loop-1', 'echo', { text: 'loop' }),
            toolUseResponse('loop-2', 'echo', { text: 'loop' }),
            toolUseResponse('loop-3', 'echo', { text: 'loop' }),
            endTurnResponse('done'),
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                // 自动批准所有工具调用
                requestApproval: async () => 'session',
            },
            {},
        )
        try {
            const result = await session.runTurn('loop?')
            assert.strictEqual(result.finalText, 'done')
            const systemMessages = session.history.filter((m) => m.role === 'system')
            // 0: initial system prompt, 1: warning
            assert.strictEqual(systemMessages.length, 2)
            assert.ok(
                systemMessages[1]?.content.includes('连续3次调用同一工具'),
                'should insert repetition warning',
            )
        } finally {
            await session.close()
        }
    })

    test('bypasses approval in dangerous mode', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'safe' }),
            endTurnResponse('done'),
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'deny',
            },
            { dangerous: true },
        )
        try {
            const result = await session.runTurn('go')
            assert.strictEqual(result.finalText, 'done')
            assert.strictEqual(result.steps[0]?.observation, 'echo:safe')
        } finally {
            await session.close()
        }
    })

    test('rejects native tool input via validateInput before execute', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'read_file', {}),
            endTurnResponse('done'),
        ]
        const session = await createAgentSession(
            {
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'once',
            },
            {},
        )
        try {
            const result = await session.runTurn('hi')
            assert.strictEqual(result.finalText, 'done')
            assert.ok(result.steps[0]?.observation?.includes('read_file invalid input'))
        } finally {
            await session.close()
        }
    })

    test('emits structured tool execution metadata in history events', async () => {
        const events: HistoryEvent[] = []
        const outputs = [
            {
                content: [
                    {
                        type: 'tool_use' as const,
                        id: 'action-1',
                        name: 'echo',
                        input: { text: 'x' },
                    },
                ],
                stop_reason: 'tool_use' as const,
            },
            {
                content: [{ type: 'text' as const, text: 'done' }],
                stop_reason: 'end_turn' as const,
            },
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [
                    {
                        append: async (event) => {
                            events.push(event)
                        },
                    },
                ],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'once',
            },
            {},
        )
        try {
            const result = await session.runTurn('meta')
            assert.strictEqual(result.finalText, 'done')

            const sessionStart = events.find((event) => event.type === 'session_start')
            assert.ok(sessionStart, 'session_start should exist')
            assert.strictEqual(sessionStart?.meta?.cwd, process.cwd())

            const actionEvent = events.find((event) => event.type === 'action')
            assert.ok(actionEvent, 'action event should exist')
            assert.strictEqual(actionEvent.meta?.phase, 'dispatch')
            assert.strictEqual(actionEvent.meta?.action_id, 'action-1')

            const observationEvent = events.find(
                (event) => event.type === 'observation' && event.meta?.action_id === 'action-1',
            )
            assert.ok(observationEvent, 'observation event should exist')
            assert.strictEqual(observationEvent.meta?.phase, 'result')
            assert.strictEqual(observationEvent.meta?.status, 'success')
            assert.strictEqual(observationEvent.meta?.error_type, undefined)
            assert.strictEqual(typeof observationEvent.meta?.duration_ms, 'number')
        } finally {
            await session.close()
        }
    })

    test('records structured tool call/result messages without json fallback payloads', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'x' }),
            endTurnResponse('done'),
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'once',
            },
            {},
        )
        try {
            const result = await session.runTurn('meta')
            assert.strictEqual(result.finalText, 'done')

            const assistantToolMessage = session.history.find(
                (message) =>
                    message.role === 'assistant' &&
                    message.tool_calls?.some((toolCall) => toolCall.id === 'action-1'),
            )
            assert.ok(assistantToolMessage, 'assistant tool_calls message should exist')

            const toolResultMessage = session.history.find(
                (message) => message.role === 'tool' && message.tool_call_id === 'action-1',
            )
            assert.ok(toolResultMessage, 'tool result message should exist')
            if (toolResultMessage?.role === 'tool') {
                assert.strictEqual(toolResultMessage.content, 'echo:x')
                assert.strictEqual(toolResultMessage.name, 'echo')
            }

            assert.ok(
                !session.history.some(
                    (message) =>
                        message.role === 'assistant' && message.content.startsWith('{"tool":'),
                ),
                'assistant history should not contain plain-text tool json payloads',
            )
            assert.ok(
                !session.history.some(
                    (message) =>
                        message.role === 'user' && message.content.includes('"observation"'),
                ),
                'history should not inject observation json through user messages',
            )
        } finally {
            await session.close()
        }
    })

    test('emits structured rejection metadata in final event', async () => {
        const events: HistoryEvent[] = []
        const outputs = [
            {
                content: [
                    {
                        type: 'tool_use' as const,
                        id: 'reject-1',
                        name: 'echo',
                        input: { text: 'x' },
                    },
                ],
                stop_reason: 'tool_use' as const,
            },
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [
                    {
                        append: async (event) => {
                            events.push(event)
                        },
                    },
                ],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'deny',
            },
            {},
        )
        try {
            const result = await session.runTurn('meta')
            assert.strictEqual(result.status, 'cancelled')
            const finalEvent = [...events].reverse().find((event) => event.type === 'final')
            assert.ok(finalEvent, 'final event should exist')
            assert.strictEqual(finalEvent?.meta?.rejected, true)
            assert.strictEqual(finalEvent?.meta?.phase, 'result')
            assert.strictEqual(finalEvent?.meta?.error_type, 'approval_denied')
            assert.strictEqual(finalEvent?.meta?.action_id, 'reject-1')
            assert.strictEqual(typeof finalEvent?.meta?.duration_ms, 'number')
        } finally {
            await session.close()
        }
    })

    test('fails with model_protocol_error when model emits plain-text tool json', async () => {
        const events: HistoryEvent[] = []
        const outputs: LLMResponse[] = [endTurnResponse('{"tool":"echo","input":{"text":"x"}}')]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [
                    {
                        append: async (event) => {
                            events.push(event)
                        },
                    },
                ],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'once',
            },
            {},
        )
        try {
            const result = await session.runTurn('recover')
            assert.strictEqual(result.status, 'error')
            assert.ok(result.finalText.includes('Model protocol error'))

            const finalEvent = [...events].reverse().find((event) => event.type === 'final')
            assert.ok(finalEvent, 'final event should exist')
            assert.strictEqual(finalEvent?.meta?.error_type, 'model_protocol_error')
            assert.strictEqual(finalEvent?.meta?.protocol_violation_count, 1)

            const turnEnd = [...events].reverse().find((event) => event.type === 'turn_end')
            assert.ok(turnEnd, 'turn_end should exist')
            assert.strictEqual(turnEnd?.meta?.status, 'error')
            assert.strictEqual(turnEnd?.meta?.protocol_violation_count, 1)
        } finally {
            await session.close()
        }
    })

    test('does not treat unknown tool json text as protocol violation', async () => {
        const outputs: LLMResponse[] = [endTurnResponse('{"tool":"unknown","input":{}}')]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'once',
            },
            {},
        )
        try {
            const result = await session.runTurn('unknown')
            assert.strictEqual(result.status, 'ok')
            assert.strictEqual(result.finalText, '{"tool":"unknown","input":{}}')
        } finally {
            await session.close()
        }
    })
})
