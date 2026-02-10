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

const readNoteTool: Tool = {
    name: 'read_note',
    description: 'read note',
    source: 'native',
    inputSchema: { type: 'object', properties: { topic: { type: 'string' } } },
    execute: async (input: unknown) => {
        const { topic } = input as { topic: string }
        return {
            content: [{ type: 'text' as const, text: `note:${topic}` }],
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

function multiToolUseResponse(
    calls: Array<{ id: string; name: string; input: unknown }>,
    text?: string,
): LLMResponse {
    return {
        content: [
            ...(text ? [{ type: 'text' as const, text }] : []),
            ...calls.map((call) => ({
                type: 'tool_use' as const,
                id: call.id,
                name: call.name,
                input: call.input,
            })),
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

    test('reuses previous assistant text when end_turn arrives empty after tool call', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'x' }, '这是最终答案'),
            endTurnResponse(''),
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
            const result = await session.runTurn('hi')
            assert.strictEqual(result.status, 'ok')
            assert.strictEqual(result.finalText, '这是最终答案')
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

    test('uses risk-based approvals in once tool permission mode', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'read_note', { topic: 'memo' }),
            endTurnResponse('done'),
        ]
        let approvalAsked = false
        const session = await createAgentSession(
            {
                tools: { read_note: readNoteTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => {
                    approvalAsked = true
                    return 'deny'
                },
            },
            { toolPermissionMode: 'once' },
        )
        try {
            const result = await session.runTurn('go')
            assert.strictEqual(result.finalText, 'done')
            assert.strictEqual(result.steps[0]?.observation, 'note:memo')
            assert.strictEqual(approvalAsked, false)
        } finally {
            await session.close()
        }
    })

    test('blocks tool calls when tool permission mode is none', async () => {
        const outputs: LLMResponse[] = [
            toolUseResponse('action-1', 'echo', { text: 'blocked' }),
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
            { toolPermissionMode: 'none' },
        )
        try {
            const result = await session.runTurn('go')
            assert.strictEqual(result.status, 'error')
            assert.ok(result.finalText.includes('Tool usage is disabled'))
            assert.strictEqual(result.steps[0]?.observation, undefined)
            const deniedToolMessage = session.history.find(
                (message) => message.role === 'tool' && message.tool_call_id === 'action-1',
            )
            assert.ok(deniedToolMessage, 'tool message should be recorded for denied tool_call_id')
            if (deniedToolMessage?.role === 'tool') {
                assert.ok(
                    deniedToolMessage.content.includes('tools are disabled'),
                    'tool message should explain why execution was skipped',
                )
            }
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
            assert.strictEqual(sessionStart?.role, 'system')
            assert.ok(
                typeof sessionStart?.content === 'string' && sessionStart.content.length > 0,
                'session_start should include system prompt content',
            )

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
            const toolMessage = session.history.find(
                (message) => message.role === 'tool' && message.tool_call_id === 'reject-1',
            )
            assert.ok(toolMessage, 'tool message should exist for rejected tool_call_id')
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

    test('records tool messages for all tool_call_ids on fail_fast rejection', async () => {
        const outputs: LLMResponse[] = [
            multiToolUseResponse([
                { id: 'reject-1', name: 'echo', input: { text: 'a' } },
                { id: 'reject-2', name: 'echo', input: { text: 'b' } },
            ]),
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                requestApproval: async () => 'deny',
            },
            {},
        )

        try {
            const result = await session.runTurn('meta')
            assert.strictEqual(result.status, 'cancelled')

            const first = session.history.find(
                (message) => message.role === 'tool' && message.tool_call_id === 'reject-1',
            )
            const second = session.history.find(
                (message) => message.role === 'tool' && message.tool_call_id === 'reject-2',
            )
            assert.ok(first, 'first tool_call_id should have a matching tool message')
            assert.ok(second, 'second tool_call_id should have a matching tool message')
            if (second?.role === 'tool') {
                assert.ok(
                    second.content.includes('Skipped tool execution after previous rejection'),
                    'missing tool execution should be represented as skipped observation',
                )
            }
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

    test('generates and persists session title on first user prompt', async () => {
        const events: HistoryEvent[] = []
        const generatedTitles: string[] = []
        const calls: Array<{ options: unknown }> = []
        const outputs: LLMResponse[] = [
            endTurnResponse('Express.js REST API'),
            endTurnResponse('done'),
        ]

        const session = await createAgentSession(
            {
                callLLM: async (_messages, _onChunk, options) => {
                    calls.push({ options })
                    return outputs.shift() ?? endTurnResponse('done')
                },
                historySinks: [
                    {
                        append: async (event) => {
                            events.push(event)
                        },
                    },
                ],
                tokenCounter: createTokenCounter('cl100k_base'),
                hooks: {
                    onTitleGenerated: ({ title }) => {
                        generatedTitles.push(title)
                    },
                },
            },
            { generateSessionTitle: true },
        )
        try {
            const result = await session.runTurn('Help me create a REST API with Express.js')
            assert.strictEqual(result.finalText, 'done')
            assert.strictEqual(session.title, 'Express.js REST API')

            const titleEvent = events.find((event) => event.type === 'session_title')
            assert.ok(titleEvent, 'session_title event should exist')
            assert.strictEqual(titleEvent?.content, 'Express.js REST API')
            assert.strictEqual(titleEvent?.meta?.source, 'llm')
            assert.deepStrictEqual(generatedTitles, ['Express.js REST API'])

            const firstCallOptions = calls[0]?.options as { tools?: unknown[] } | undefined
            assert.ok(firstCallOptions, 'first call options should exist')
            assert.ok(
                Array.isArray(firstCallOptions?.tools),
                'title call should override tools list',
            )
            assert.strictEqual(firstCallOptions?.tools?.length, 0)
        } finally {
            await session.close()
        }
    })

    test('falls back to prompt-derived title when title generation fails', async () => {
        const events: HistoryEvent[] = []
        const outputs: LLMResponse[] = [
            { content: [], stop_reason: 'end_turn' },
            endTurnResponse('done'),
            endTurnResponse('done-again'),
        ]

        const session = await createAgentSession(
            {
                callLLM: async () => outputs.shift() ?? endTurnResponse('done'),
                historySinks: [
                    {
                        append: async (event) => {
                            events.push(event)
                        },
                    },
                ],
                tokenCounter: createTokenCounter('cl100k_base'),
            },
            { generateSessionTitle: true },
        )
        try {
            const first = await session.runTurn('Build migration plan for v2 release')
            assert.strictEqual(first.finalText, 'done')
            assert.strictEqual(session.title, 'Build migration plan for v2 release')

            const second = await session.runTurn('continue')
            assert.strictEqual(second.finalText, 'done-again')

            const titleEvents = events.filter((event) => event.type === 'session_title')
            assert.strictEqual(titleEvents.length, 1, 'session_title should be emitted once')
            assert.strictEqual(titleEvents[0]?.meta?.source, 'fallback')
        } finally {
            await session.close()
        }
    })
})
