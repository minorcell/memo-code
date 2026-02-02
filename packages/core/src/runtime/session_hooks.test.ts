/** @file Session Hook & Middleware 行为测试。 */
import assert from 'node:assert'
import { describe, test } from 'vitest'
import { createAgentSession, createTokenCounter } from '@memo/core'
import type { Tool } from '@memo/core/toolRouter'

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

describe('session hooks & middleware', () => {
    test('invokes hooks and middlewares in order', async () => {
        const outputs = ['```json\n{"tool":"echo","input":{"text":"foo"}}\n```', '{"final":"done"}']
        const hookLog: string[] = []
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => ({
                    content: outputs.shift() ?? JSON.stringify({ final: 'done' }),
                }),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
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

    test('executes action even when message looks like final text', async () => {
        const outputs = [
            '<think>demo</think>\n\n{"tool":"echo","input":{"text":"hi"}}',
            '{"final":"done"}',
        ]
        const hookLog: string[] = []
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => ({
                    content: outputs.shift() ?? JSON.stringify({ final: 'done' }),
                }),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
                hooks: {
                    onAction: ({ action }) => hookLog.push(`action:${action.tool}`),
                    onFinal: ({ finalText }) => hookLog.push(`final:${finalText}`),
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
        const outputs = [
            '{"tool":"echo","input":{"text":"loop"}}',
            '{"tool":"echo","input":{"text":"loop"}}',
            '{"tool":"echo","input":{"text":"loop"}}',
            '{"final":"done"}',
        ]
        const session = await createAgentSession(
            {
                tools: { echo: echoTool },
                callLLM: async () => ({
                    content: outputs.shift() ?? JSON.stringify({ final: 'done' }),
                }),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
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
})
