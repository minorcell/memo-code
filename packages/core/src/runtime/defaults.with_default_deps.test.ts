import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type {
    AgentSessionDeps,
    AgentSessionOptions,
    ChatMessage,
    ToolDefinition,
    ToolRegistry,
} from '@memo/core/types'
import type { MCPServerConfig } from '@memo/core/config/config'
import type { Tool } from '@memo/tools/router'

const state = vi.hoisted(() => ({
    loadedConfig: {
        home: '/tmp/memo-home',
        path: '/tmp/memo-home/config.toml',
        config: {
            current_provider: 'mock',
            providers: [
                {
                    name: 'mock',
                    env_api_key: 'MOCK_API_KEY',
                    model: 'mock-model',
                    base_url: 'https://mock.local/v1',
                },
            ],
            model_profiles: {},
            mcp_servers: {
                alpha: { command: 'node', args: ['alpha.js'] } as MCPServerConfig,
                beta: { command: 'node', args: ['beta.js'] } as MCPServerConfig,
            },
        },
    },
    selectedProvider: {
        name: 'mock',
        env_api_key: 'MOCK_API_KEY',
        model: 'mock-model',
        base_url: 'https://mock.local/v1',
    },
    sessionsDir: '/tmp/memo-sessions',
    sessionPath: '/tmp/memo-sessions/session-1.jsonl',
    toolDescriptions: '## Tools\n- mock_tool',
    toolDefinitions: [
        {
            name: 'mock_tool',
            description: 'mock tool',
            input_schema: { type: 'object', properties: {} },
        },
    ] as ToolDefinition[],
    registry: {
        mock_tool: {
            name: 'mock_tool',
            description: 'mock tool',
            source: 'native',
            inputSchema: { type: 'object' },
            execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        } as Tool,
    } as ToolRegistry,
    loadMcpServersCalls: [] as unknown[],
    registerNativeToolsCalls: [] as unknown[],
    registerNativeToolCalls: [] as unknown[],
    createOpenAICalls: [] as unknown[],
    openAIModelCalls: [] as unknown[],
    generateTextCalls: [] as unknown[],
    historySinkPaths: [] as string[],
    routerDisposed: 0,
    createTokenCounterCalls: [] as Array<string | undefined>,
    promptText: 'SYSTEM_PROMPT',
    generateTextResponse: {
        text: 'ok',
        reasoningText: undefined,
        toolCalls: [],
        finishReason: 'stop',
        usage: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
        },
    } as Record<string, unknown>,
}))

vi.mock('@memo/tools', () => ({
    NATIVE_TOOLS: [],
}))

vi.mock('@memo/core/config/config', () => ({
    loadMemoConfig: vi.fn(async () => state.loadedConfig),
    selectProvider: vi.fn(() => state.selectedProvider),
    getSessionsDir: vi.fn(() => state.sessionsDir),
    buildSessionPath: vi.fn(() => state.sessionPath),
}))

vi.mock('@memo/core/runtime/history', () => ({
    JsonlHistorySink: class JsonlHistorySink {
        constructor(path: string) {
            state.historySinkPaths.push(path)
        }
    },
}))

vi.mock('@memo/core/runtime/prompt', () => ({
    loadSystemPrompt: vi.fn(async () => state.promptText),
}))

vi.mock('@memo/core/utils/tokenizer', () => ({
    createTokenCounter: vi.fn((model?: string) => {
        state.createTokenCounterCalls.push(model)
        return {
            model: model ?? 'mock-tokenizer',
            countText: (text: string) => text.length,
            countMessages: (messages: Array<{ content: string }>) =>
                messages.reduce((sum, message) => sum + message.content.length, 0),
            dispose: vi.fn(),
        }
    }),
}))

vi.mock('@memo/tools/router', () => ({
    ToolRouter: class ToolRouter {
        registerNativeTools(tools: unknown) {
            state.registerNativeToolsCalls.push(tools)
        }

        async loadMcpServers(servers: unknown, options: unknown) {
            state.loadMcpServersCalls.push([servers, options])
        }

        registerNativeTool(tool: unknown) {
            state.registerNativeToolCalls.push(tool)
        }

        toRegistry() {
            return state.registry
        }

        generateToolDescriptions() {
            return state.toolDescriptions
        }

        generateToolDefinitions() {
            return state.toolDefinitions
        }

        async dispose() {
            state.routerDisposed += 1
        }
    },
}))

vi.mock('@ai-sdk/openai', () => ({
    createOpenAI: vi.fn((options: unknown) => {
        state.createOpenAICalls.push(options)
        return {
            chat: (modelId: string) => {
                state.openAIModelCalls.push(modelId)
                return { provider: 'openai-compatible', modelId }
            },
        }
    }),
}))

vi.mock('ai', () => ({
    generateText: vi.fn(async (request: unknown) => {
        state.generateTextCalls.push(request)
        return state.generateTextResponse
    }),
    jsonSchema: vi.fn((schema: unknown) => schema),
    tool: vi.fn((definition: unknown) => definition),
}))

describe('withDefaultDeps (default path)', () => {
    beforeEach(() => {
        state.loadMcpServersCalls = []
        state.registerNativeToolsCalls = []
        state.registerNativeToolCalls = []
        state.createOpenAICalls = []
        state.openAIModelCalls = []
        state.generateTextCalls = []
        state.historySinkPaths = []
        state.routerDisposed = 0
        state.createTokenCounterCalls = []
        state.toolDescriptions = '## Tools\n- mock_tool'
        state.promptText = 'SYSTEM_PROMPT'
        state.generateTextResponse = {
            text: 'ok',
            reasoningText: undefined,
            toolCalls: [],
            finishReason: 'stop',
            usage: {
                inputTokens: 11,
                outputTokens: 7,
                totalTokens: 18,
            },
        }
        delete process.env.MOCK_API_KEY
        delete process.env.OPENAI_API_KEY
        delete process.env.DEEPSEEK_API_KEY
    })

    afterEach(() => {
        delete process.env.MOCK_API_KEY
        delete process.env.OPENAI_API_KEY
        delete process.env.DEEPSEEK_API_KEY
    })

    test('builds default deps with injected tool descriptions and default sinks', async () => {
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')

        const resolved = await withDefaultDeps(
            {},
            { tokenizerModel: 'counter-model' } as AgentSessionOptions,
            'session-1',
        )

        expect(state.loadMcpServersCalls).toHaveLength(1)
        expect(state.historySinkPaths).toEqual([state.sessionPath])
        expect(state.createTokenCounterCalls).toEqual(['counter-model'])
        expect(resolved.historyFilePath).toBe(state.sessionPath)

        const prompt = await resolved.loadPrompt()
        expect(prompt).toContain('SYSTEM_PROMPT')
        expect(prompt).toContain('## Tools\n- mock_tool')
    })

    test('respects provided deps overrides (callLLM/historySinks/tokenCounter/loadPrompt/dispose)', async () => {
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')
        const callLLM = vi.fn(async () => ({
            content: [{ type: 'text' as const, text: 'override' }],
            stop_reason: 'end_turn' as const,
        }))
        const historySinks = [{ append: vi.fn() }]
        const tokenCounter = {
            model: 'custom-counter',
            countText: (text: string) => text.length,
            countMessages: (messages: Array<{ content: string }>) =>
                messages.reduce((sum, message) => sum + message.content.length, 0),
            dispose: vi.fn(),
        }
        const dispose = vi.fn(async () => {})

        const resolved = await withDefaultDeps(
            {
                callLLM,
                historySinks,
                tokenCounter,
                loadPrompt: async () => 'CUSTOM_PROMPT',
                dispose,
            } as AgentSessionDeps,
            {} as AgentSessionOptions,
            'session-2',
        )

        expect(await resolved.loadPrompt()).toContain('CUSTOM_PROMPT')
        expect(resolved.callLLM).toBe(callLLM)
        expect(resolved.historySinks).toBe(historySinks)
        expect(resolved.tokenCounter).toBe(tokenCounter)

        await resolved.dispose()
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(state.routerDisposed).toBe(1)
    })

    test('throws when provider api key is missing', async () => {
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')
        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-3')

        await expect(
            resolved.callLLM([{ role: 'user', content: 'hello' } as ChatMessage]),
        ).rejects.toThrow('Missing env var MOCK_API_KEY')
    })

    test('uses provider env key and provider base_url', async () => {
        process.env.MOCK_API_KEY = 'mock-provider-key'
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')
        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-3b')

        await resolved.callLLM([{ role: 'user', content: 'hello' } as ChatMessage])
        expect(state.createOpenAICalls[0]).toEqual({
            apiKey: 'mock-provider-key',
            baseURL: 'https://mock.local/v1',
        })
        expect(state.openAIModelCalls[0]).toBe('mock-model')
    })

    test('falls back to OPENAI_API_KEY when provider key is missing', async () => {
        process.env.OPENAI_API_KEY = 'openai-fallback-key'
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')
        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-3c')

        await resolved.callLLM([{ role: 'user', content: 'hello' } as ChatMessage])
        expect(state.createOpenAICalls[0]).toEqual({
            apiKey: 'openai-fallback-key',
            baseURL: 'https://mock.local/v1',
        })
    })

    test('maps AI SDK tool calls into tool_use blocks', async () => {
        process.env.MOCK_API_KEY = 'test-key'
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')
        const callOptionsTools: ToolDefinition[] = [
            {
                name: 'override',
                description: 'override tool',
                input_schema: { type: 'object', properties: {} },
            },
        ]
        const signal = new AbortController().signal

        state.generateTextResponse = {
            text: 'assistant text',
            reasoningText: '  reasoned  ',
            toolCalls: [
                {
                    toolCallId: 'call-ok',
                    toolName: 'echo',
                    input: { value: 1 },
                },
            ],
            finishReason: 'tool-calls',
            usage: {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
            },
        }

        const chunks: string[] = []
        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-4')
        const response = await resolved.callLLM(
            [
                {
                    role: 'assistant',
                    content: '',
                    reasoning_content: 'reasoning content',
                    tool_calls: [
                        {
                            id: 'prev-call',
                            type: 'function',
                            function: { name: 'read_file', arguments: '{}' },
                        },
                    ],
                },
                {
                    role: 'tool',
                    content: 'observation',
                    tool_call_id: 'prev-call',
                    name: 'read_file',
                },
                { role: 'user', content: 'continue' },
            ],
            (chunk) => {
                chunks.push(chunk)
            },
            { tools: callOptionsTools, signal },
        )

        expect(response.stop_reason).toBe('tool_use')
        expect(response.reasoning_content).toBe('reasoned')
        expect(response.usage).toEqual({ prompt: 10, completion: 5, total: 15 })
        expect(response.content[0]).toEqual({ type: 'text', text: 'assistant text' })
        expect(response.content).toContainEqual({
            type: 'tool_use',
            id: 'call-ok',
            name: 'echo',
            input: { value: 1 },
        })
        expect(chunks).toEqual(['assistant text'])

        expect(state.generateTextCalls).toHaveLength(1)
        const request = state.generateTextCalls[0] as {
            abortSignal: AbortSignal
            messages: Array<Record<string, unknown>>
            tools: Record<string, unknown>
        }
        expect(request.abortSignal).toBe(signal)
        expect(request.tools).toHaveProperty('override')
        expect(
            request.messages.some(
                (msg) =>
                    msg.role === 'tool' &&
                    Array.isArray(msg.content) &&
                    (msg.content[0] as { type?: string }).type === 'tool-result',
            ),
        ).toBe(true)
    })

    test('returns plain text end_turn response with usage', async () => {
        process.env.MOCK_API_KEY = 'test-key'
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')

        state.generateTextResponse = {
            text: 'plain assistant answer',
            reasoningText: '  concise reason  ',
            toolCalls: [],
            finishReason: 'stop',
            usage: {
                inputTokens: 3,
                outputTokens: 4,
                totalTokens: 7,
            },
        }

        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-5b')
        const response = await resolved.callLLM([{ role: 'user', content: 'x' } as ChatMessage])
        expect(response.stop_reason).toBe('end_turn')
        expect(response.reasoning_content).toBe('concise reason')
        expect(response.content).toEqual([{ type: 'text', text: 'plain assistant answer' }])
        expect(response.usage).toEqual({ prompt: 3, completion: 4, total: 7 })
    })

    test('throws when AI SDK returns empty content', async () => {
        process.env.MOCK_API_KEY = 'test-key'
        const { withDefaultDeps } = await import('@memo/core/runtime/defaults')

        state.generateTextResponse = {
            text: '',
            reasoningText: undefined,
            toolCalls: [],
            finishReason: 'stop',
            usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
            },
        }

        const resolved = await withDefaultDeps({}, {} as AgentSessionOptions, 'session-6')
        await expect(
            resolved.callLLM([{ role: 'user', content: 'x' } as ChatMessage]),
        ).rejects.toThrow('AI SDK returned empty content')
    })
})
