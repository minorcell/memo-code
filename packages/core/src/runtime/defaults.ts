/** @file Session 默认依赖装配：工具集、LLM、历史 sink、tokenizer 等。 */
import { NATIVE_TOOLS } from '@memo/tools'
import OpenAI from 'openai'
import { createTokenCounter } from '@memo/core/utils/tokenizer'
import {
    buildSessionPath,
    getSessionsDir,
    getMemoryPath,
    loadMemoConfig,
    selectProvider,
} from '@memo/core/config/config'
import { JsonlHistorySink } from '@memo/core/runtime/history'
import { loadSystemPrompt as defaultLoadPrompt } from '@memo/core/runtime/prompt'
import { ToolRouter } from '@memo/core/toolRouter'
import { readFile, access } from 'node:fs/promises'
import type {
    AgentSessionDeps,
    AgentSessionOptions,
    CallLLM,
    HistorySink,
    TokenCounter,
    ToolRegistry,
} from '@memo/core/types'

export function parseToolArguments(
    raw: string,
): { ok: true; data: unknown } | { ok: false; raw: string; error: string } {
    try {
        return { ok: true, data: JSON.parse(raw) }
    } catch (err) {
        return { ok: false, raw, error: (err as Error).message }
    }
}

/**
 * 根据缺省策略补全依赖项（工具、callLLM、prompt、history sinks、tokenizer）。
 * 调用方可仅提供回调/覆盖项，其余使用默认实现。
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

    // 1. 初始化 ToolRouter
    const router = new ToolRouter()

    // 2. 注册内置工具
    router.registerNativeTools(NATIVE_TOOLS)

    // 3. 加载外部 MCP 工具（遵循 MEMO_HOME）
    await router.loadMcpServers(config.mcp_servers)

    // 4. 合并用户自定义工具（deps.tools 优先级最高）
    if (deps.tools) {
        for (const [name, tool] of Object.entries(deps.tools)) {
            // 用户自定义工具覆盖 router 中的同名工具
            router.registerNativeTool({
                name,
                description: tool.description,
                source: 'native',
                inputSchema: { type: 'object' }, // 简化处理，实际应该从 tool 转换
                execute: tool.execute,
            })
        }
    }

    // 5. 获取最终工具注册表
    const combinedTools = router.toRegistry()

    // 6. 构建 loadPrompt（包含工具描述）
    const loadPrompt = async () => {
        let basePrompt = await (deps.loadPrompt ?? defaultLoadPrompt)()

        // 注入工具描述到 prompt（用于非 Tool Use API 模式）
        const toolDescriptions = router.generateToolDescriptions()
        if (toolDescriptions) {
            basePrompt += `\n\n${toolDescriptions}`
        }

        // 注入长期记忆
        const memoryPath = getMemoryPath(loaded)
        try {
            await access(memoryPath)
            const memory = (await readFile(memoryPath, 'utf-8')).trim()
            if (memory) {
                basePrompt += `\n\n# Long-Term Memory\n${memory}`
            }
        } catch {
            // Memory file doesn't exist, ignore
        }

        return basePrompt
    }

    // 7. 生成工具定义（用于 Tool Use API）
    const toolDefinitions = router.generateToolDefinitions()

    const streamOutput = options.stream ?? config.stream_output ?? false
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
            (async (messages, onChunk, callOptions) => {
                const provider = selectProvider(config, options.providerName)
                const apiKey =
                    process.env[provider.env_api_key] ??
                    process.env.OPENAI_API_KEY ??
                    process.env.DEEPSEEK_API_KEY
                if (!apiKey) {
                    throw new Error(
                        `Missing env var ${provider.env_api_key} (or OPENAI_API_KEY/DEEPSEEK_API_KEY)`,
                    )
                }
                const client = new OpenAI({
                    apiKey,
                    baseURL: provider.base_url,
                })

                // 构建 OpenAI 格式的工具定义
                const tools =
                    toolDefinitions.length > 0
                        ? toolDefinitions.map((tool) => ({
                              type: 'function' as const,
                              function: {
                                  name: tool.name,
                                  description: tool.description,
                                  parameters: tool.input_schema,
                              },
                          }))
                        : undefined

                if (streamOutput) {
                    // 流式模式暂不支持 Tool Use（OpenAI 限制）
                    const stream = await client.chat.completions.create(
                        {
                            model: provider.model,
                            messages,
                            stream: true,
                        },
                        { signal: callOptions?.signal },
                    )
                    let content = ''
                    for await (const part of stream) {
                        const delta = part.choices?.[0]?.delta?.content
                        if (delta) {
                            content += delta
                            onChunk?.(delta)
                        }
                    }
                    return { content, streamed: true }
                } else {
                    const data = await client.chat.completions.create(
                        {
                            model: provider.model,
                            messages,
                            tools,
                            tool_choice: tools ? 'auto' : undefined,
                        },
                        { signal: callOptions?.signal },
                    )

                    const message = data.choices?.[0]?.message

                    // 检查是否有工具调用
                    if (message?.tool_calls && message.tool_calls.length > 0) {
                        const content: Array<
                            | { type: 'text'; text: string }
                            | { type: 'tool_use'; id: string; name: string; input: unknown }
                        > = []

                        // 添加文本内容（如果有）
                        if (message.content) {
                            content.push({ type: 'text', text: message.content })
                        }

                        // 添加工具调用
                        for (const toolCall of message.tool_calls) {
                            if (toolCall.type === 'function') {
                                const parsedArgs = parseToolArguments(toolCall.function.arguments)
                                if (parsedArgs.ok) {
                                    content.push({
                                        type: 'tool_use',
                                        id: toolCall.id,
                                        name: toolCall.function.name,
                                        input: parsedArgs.data,
                                    })
                                } else {
                                    content.push({
                                        type: 'text',
                                        text: `[tool_use parse error] ${parsedArgs.error}; raw: ${parsedArgs.raw}`,
                                    })
                                }
                            }
                        }

                        const hasToolUse = content.some((c) => c.type === 'tool_use')
                        return {
                            content,
                            stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
                            usage: {
                                prompt: data.usage?.prompt_tokens ?? undefined,
                                completion: data.usage?.completion_tokens ?? undefined,
                                total: data.usage?.total_tokens ?? undefined,
                            },
                        }
                    }

                    // 普通文本响应
                    const content = message?.content
                    if (typeof content !== 'string') {
                        throw new Error('OpenAI-compatible API returned empty content')
                    }
                    return {
                        content: [{ type: 'text', text: content }],
                        stop_reason: 'end_turn',
                        usage: {
                            prompt: data.usage?.prompt_tokens ?? undefined,
                            completion: data.usage?.completion_tokens ?? undefined,
                            total: data.usage?.total_tokens ?? undefined,
                        },
                    }
                }
            }),
        loadPrompt,
        historySinks: deps.historySinks ?? [defaultHistorySink],
        tokenCounter: deps.tokenCounter ?? createTokenCounter(options.tokenizerModel),
        historyFilePath: historyFilePath,
    }
}
