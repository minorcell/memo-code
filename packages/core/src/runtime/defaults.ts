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
import type {
    AgentSessionDeps,
    AgentSessionOptions,
    CallLLM,
    HistorySink,
    TokenCounter,
    ToolRegistry,
} from '@memo/core/types'

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
    maxSteps: number
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

        // 注入工具描述到 prompt
        const toolDescriptions = router.generateToolDescriptions()
        if (toolDescriptions) {
            basePrompt += `\n\n${toolDescriptions}`
        }

        // 注入长期记忆
        const memoryPath = getMemoryPath(loaded)
        try {
            const file = Bun.file(memoryPath)
            if (await file.exists()) {
                const memory = (await file.text()).trim()
                if (memory) {
                    basePrompt += `\n\n# Long-Term Memory\n${memory}`
                }
            }
        } catch (err) {
            console.warn(`Failed to read memo: ${(err as Error).message}`)
        }

        return basePrompt
    }

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
                if (streamOutput) {
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
                        },
                        { signal: callOptions?.signal },
                    )
                    const content = data.choices?.[0]?.message?.content
                    if (typeof content !== 'string') {
                        throw new Error('OpenAI-compatible API returned empty content')
                    }
                    return {
                        content,
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
        maxSteps: options.maxSteps ?? config.max_steps ?? 100,
        historyFilePath: historyFilePath,
    }
}
