/** @file Session default dependency assembly: toolset, LLM, history sinks, tokenizer, etc. */
import { NATIVE_TOOLS } from '@memo/tools'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, jsonSchema, tool, type ModelMessage } from 'ai'
import { createTokenCounter } from '@memo/core/utils/tokenizer'
import {
    buildSessionPath,
    getSessionsDir,
    loadMemoConfig,
    selectProvider,
} from '@memo/core/config/config'
import { JsonlHistorySink } from '@memo/core/runtime/history'
import { loadSystemPrompt as defaultLoadPrompt } from '@memo/core/runtime/prompt'
import { ToolRouter } from '@memo/tools/router'
import type {
    AgentSessionDeps,
    AgentSessionOptions,
    CallLLM,
    ChatMessage,
    HistorySink,
    TokenCounter,
    ToolRegistry,
    ToolDefinition,
} from '@memo/core/types'
import type { MCPServerConfig } from '@memo/core/config/config'

export function filterMcpServersBySelection(
    servers: Record<string, MCPServerConfig> | undefined,
    activeNames: string[] | undefined,
): Record<string, MCPServerConfig> | undefined {
    if (!servers) return servers
    if (!activeNames) return servers

    const selected = new Set(activeNames.map((name) => name.trim()).filter(Boolean))
    if (selected.size === 0) return {}

    const filtered: Record<string, MCPServerConfig> = {}
    for (const [name, config] of Object.entries(servers)) {
        if (selected.has(name)) {
            filtered[name] = config
        }
    }
    return filtered
}

export function parseToolArguments(
    raw: string,
): { ok: true; data: unknown } | { ok: false; raw: string; error: string } {
    try {
        return { ok: true, data: JSON.parse(raw) }
    } catch (err) {
        return { ok: false, raw, error: (err as Error).message }
    }
}

function toModelMessage(message: ChatMessage): ModelMessage {
    if (message.role === 'assistant') {
        const hasReasoning =
            typeof message.reasoning_content === 'string' &&
            message.reasoning_content.trim().length > 0
        const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
        if (!hasReasoning && !hasToolCalls) {
            return { role: 'assistant', content: message.content }
        }

        const content: Array<
            | { type: 'text'; text: string }
            | { type: 'reasoning'; text: string }
            | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
        > = []
        if (message.content) {
            content.push({ type: 'text', text: message.content })
        }
        if (hasReasoning && message.reasoning_content) {
            content.push({ type: 'reasoning', text: message.reasoning_content })
        }
        if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                const parsed = parseToolArguments(toolCall.function.arguments)
                content.push({
                    type: 'tool-call',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    input: parsed.ok ? parsed.data : { raw: parsed.raw },
                })
            }
        }

        return { role: 'assistant', content }
    }

    if (message.role === 'tool') {
        return {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: message.tool_call_id,
                    toolName: message.name?.trim() || 'unknown_tool',
                    output: {
                        type: 'text',
                        value: message.content,
                    },
                },
            ],
        }
    }

    return { role: message.role, content: message.content }
}

function resolveProviderApiKey(envApiKeyName: string): string {
    const value =
        process.env[envApiKeyName] ?? process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY

    if (!value) {
        throw new Error(`Missing env var ${envApiKeyName} (or OPENAI_API_KEY/DEEPSEEK_API_KEY)`)
    }
    return value
}

function resolveProviderModelId(model: string): string {
    return model.trim()
}

function toGenerateTextTools(toolDefinitions: ToolDefinition[]) {
    if (toolDefinitions.length === 0) return undefined

    const entries = toolDefinitions.map((definition) => {
        const inputSchema =
            definition.input_schema &&
            typeof definition.input_schema === 'object' &&
            !Array.isArray(definition.input_schema)
                ? definition.input_schema
                : { type: 'object' }

        return [
            definition.name,
            tool({
                description: definition.description,
                inputSchema: jsonSchema(inputSchema as Record<string, unknown>),
            }),
        ] as const
    })
    return Object.fromEntries(entries)
}

function normalizeReasoning(text: string | undefined): string | undefined {
    const trimmed = text?.trim()
    return trimmed ? trimmed : undefined
}

function mapFinishReasonToStopReason(
    finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other',
    toolCallCount: number,
): 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' {
    if (toolCallCount > 0 || finishReason === 'tool-calls') {
        return 'tool_use'
    }
    if (finishReason === 'length') return 'max_tokens'
    return 'end_turn'
}

/**
 * Complete dependencies with default strategy (tools, callLLM, prompt, history sinks, tokenizer).
 * Caller can provide only callbacks/overrides, rest use default implementations.
 */
export async function withDefaultDeps(
    deps: AgentSessionDeps,
    options: AgentSessionOptions,
    sessionId: string,
): Promise<{
    tools: ToolRegistry
    callLLM: CallLLM
    loadPrompt: () => Promise<string>
    historySinks: HistorySink[]
    tokenCounter: TokenCounter
    dispose: () => Promise<void>
    historyFilePath?: string
}> {
    const loaded = await loadMemoConfig()
    const config = loaded.config

    // 1. Initialize ToolRouter
    const router = new ToolRouter()

    // 2. Register built-in tools
    router.registerNativeTools(NATIVE_TOOLS)

    // 3. Load external MCP tools (follows MEMO_HOME)
    await router.loadMcpServers(
        filterMcpServersBySelection(config.mcp_servers, options.activeMcpServers),
        {
            memoHome: loaded.home,
            storeMode: config.mcp_oauth_credentials_store_mode,
            callbackPort: config.mcp_oauth_callback_port,
        },
    )

    // 4. Merge user custom tools (deps.tools has highest priority)
    if (deps.tools) {
        for (const [name, tool] of Object.entries(deps.tools)) {
            // User custom tools override同名 tools in router
            router.registerNativeTool({
                name,
                description: tool.description,
                source: 'native',
                inputSchema: { type: 'object' }, // Simplified, should convert from tool in practice
                execute: tool.execute,
            })
        }
    }

    // 5. Get final tool registry
    const combinedTools = router.toRegistry()

    // 6. Build loadPrompt (includes tool descriptions)
    const loadPrompt = async () => {
        let basePrompt = deps.loadPrompt
            ? await deps.loadPrompt()
            : await defaultLoadPrompt({
                  cwd: options.cwd,
                  memoHome: loaded.home,
                  activeSkillPaths: config.active_skills,
              })

        // Inject tool descriptions into prompt (for non-Tool Use API mode)
        const toolDescriptions = router.generateToolDescriptions()
        if (toolDescriptions) {
            basePrompt += `\n\n${toolDescriptions}`
        }

        return basePrompt
    }

    // 7. Generate tool definitions (for Tool Use API)
    const toolDefinitions = router.generateToolDefinitions()

    const sessionsDir = getSessionsDir(loaded, options)
    const historyFilePath = buildSessionPath(sessionsDir, sessionId)
    const defaultHistorySink = new JsonlHistorySink(historyFilePath)

    return {
        tools: combinedTools,
        dispose: async () => {
            if (deps.dispose) await deps.dispose()
            await router.dispose()
        },
        callLLM:
            deps.callLLM ??
            (async (messages, _onChunk, callOptions) => {
                const provider = selectProvider(config, options.providerName)
                const apiKey = resolveProviderApiKey(provider.env_api_key)
                const baseURL = provider.base_url?.trim() || undefined
                const openaiProvider = createOpenAI({
                    apiKey,
                    ...(baseURL ? { baseURL } : {}),
                })
                const modelId = resolveProviderModelId(provider.model)
                const model = openaiProvider.chat(modelId)
                const modelMessages = messages.map(toModelMessage)
                const effectiveToolDefinitions = callOptions?.tools ?? toolDefinitions
                const generated = await generateText({
                    model,
                    messages: modelMessages,
                    tools: toGenerateTextTools(effectiveToolDefinitions),
                    abortSignal: callOptions?.signal,
                })
                const content: Array<
                    | { type: 'text'; text: string }
                    | { type: 'tool_use'; id: string; name: string; input: unknown }
                > = []
                if (generated.text) {
                    _onChunk?.(generated.text)
                    content.push({ type: 'text', text: generated.text })
                }
                for (const toolCall of generated.toolCalls) {
                    content.push({
                        type: 'tool_use',
                        id: toolCall.toolCallId,
                        name: toolCall.toolName,
                        input: toolCall.input,
                    })
                }

                if (content.length === 0) {
                    throw new Error('AI SDK returned empty content')
                }

                return {
                    content,
                    reasoning_content: normalizeReasoning(generated.reasoningText),
                    stop_reason: mapFinishReasonToStopReason(
                        generated.finishReason,
                        generated.toolCalls.length,
                    ),
                    usage: {
                        prompt: generated.usage.inputTokens ?? undefined,
                        completion: generated.usage.outputTokens ?? undefined,
                        total: generated.usage.totalTokens ?? undefined,
                    },
                }
            }),
        loadPrompt,
        historySinks: deps.historySinks ?? [defaultHistorySink],
        tokenCounter: deps.tokenCounter ?? createTokenCounter(options.tokenizerModel),
        historyFilePath: historyFilePath,
    }
}
