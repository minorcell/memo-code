/** @file Session/Turn 运行时核心：负责 ReAct 循环、工具调度与事件记录。 */
import { randomUUID } from 'node:crypto'
import { createHistoryEvent } from '@memo/core/runtime/history'
import { withDefaultDeps } from '@memo/core/runtime/defaults'
import { buildThinking, parseAssistant } from '@memo/core/utils/utils'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import type {
    ChatMessage,
    AgentSession,
    AgentSessionDeps,
    AgentSessionOptions,
    AgentStepTrace,
    HistoryEvent,
    HistorySink,
    LLMResponse,
    ParsedAssistant,
    SessionMode,
    TokenCounter,
    TokenUsage,
    ToolRegistry,
    TurnResult,
    TurnStatus,
    TextBlock,
    ToolUseBlock,
} from '@memo/core/types'
import {
    buildHookRunners,
    runHook,
    snapshotHistory,
    type HookRunnerMap,
} from '@memo/core/runtime/hooks'

const DEFAULT_SESSION_MODE: SessionMode = 'interactive'

function emptyUsage(): TokenUsage {
    return { prompt: 0, completion: 0, total: 0 }
}

function accumulateUsage(target: TokenUsage, delta?: Partial<TokenUsage>) {
    if (!delta) return
    const promptDelta = delta.prompt ?? 0
    const completionDelta = delta.completion ?? 0
    const totalDelta = delta.total ?? promptDelta + completionDelta
    target.prompt += promptDelta
    target.completion += completionDelta
    target.total += totalDelta
}

function normalizeLLMResponse(raw: LLMResponse): {
    textContent: string
    toolUseBlocks: Array<{ id: string; name: string; input: unknown }>
    stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
    usage?: Partial<TokenUsage>
    streamed?: boolean
} {
    // 处理传统字符串响应
    if (typeof raw === 'string') {
        return { textContent: raw, toolUseBlocks: [] }
    }

    // 处理传统对象响应（content 是字符串）
    if ('content' in raw && typeof raw.content === 'string') {
        return {
            textContent: raw.content,
            toolUseBlocks: [],
            usage: 'usage' in raw ? raw.usage : undefined,
            streamed: 'streamed' in raw ? raw.streamed : undefined,
        }
    }

    // 处理 Tool Use API 响应（content 是数组）
    if ('content' in raw && Array.isArray(raw.content)) {
        const textBlocks = raw.content.filter((block): block is TextBlock => block.type === 'text')
        const toolBlocks = raw.content.filter(
            (block): block is ToolUseBlock => block.type === 'tool_use',
        )

        return {
            textContent: textBlocks.map((b) => b.text).join('\n'),
            toolUseBlocks: toolBlocks.map((b) => ({
                id: b.id,
                name: b.name,
                input: b.input,
            })),
            stopReason: 'stop_reason' in raw ? raw.stop_reason : undefined,
            usage: 'usage' in raw ? raw.usage : undefined,
        }
    }

    // 降级处理
    return { textContent: '', toolUseBlocks: [] }
}

async function emitEventToSinks(event: HistoryEvent, sinks: HistorySink[]) {
    for (const sink of sinks) {
        try {
            await sink.append(event)
        } catch (err) {
            console.error(`Failed to write history event: ${(err as Error).message}`)
        }
    }
}

function flattenCallToolResult(result: CallToolResult): string {
    const texts =
        result.content?.flatMap((item) => {
            if (item.type === 'text') return [item.text]
            return []
        }) ?? []
    return texts.join('\n')
}

function parseToolInput(tool: ToolRegistry[string], rawInput: unknown) {
    let candidate: unknown = rawInput
    if (typeof rawInput === 'string') {
        const trimmed = rawInput.trim()
        if (trimmed) {
            try {
                candidate = JSON.parse(trimmed)
            } catch {
                candidate = trimmed
            }
        } else {
            candidate = {}
        }
    }

    // 新版 Tool 类型使用 JSON Schema，验证逻辑简化
    // 实际验证由工具内部（内置工具）或 MCP Server 处理
    // 这里只做基本的类型检查
    if (typeof candidate !== 'object' || candidate === null) {
        return { ok: false as const, error: `${tool.name} invalid input: expected object` }
    }

    return { ok: true as const, data: candidate }
}

function isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError'
}

/** 进程内的对话 Session，实现多轮运行与日志写入。 */
class AgentSessionImpl implements AgentSession {
    public id: string
    public mode: SessionMode
    public history: ChatMessage[]
    public historyFilePath?: string

    private turnIndex = 0
    private tokenCounter: TokenCounter
    private sinks: HistorySink[]
    private sessionUsage: TokenUsage = emptyUsage()
    private startedAt = Date.now()
    private hooks: HookRunnerMap
    private closed = false
    private currentAbortController: AbortController | null = null
    private cancelling = false

    constructor(
        private deps: AgentSessionDeps & {
            tools: ToolRegistry
            callLLM: NonNullable<AgentSessionDeps['callLLM']>
        },
        private options: AgentSessionOptions,
        systemPrompt: string,
        tokenCounter: TokenCounter,
        historyFilePath?: string,
    ) {
        this.id = options.sessionId || randomUUID()
        this.mode = options.mode || DEFAULT_SESSION_MODE
        this.history = [{ role: 'system', content: systemPrompt }]
        this.tokenCounter = tokenCounter
        this.sinks = deps.historySinks ?? []
        this.hooks = buildHookRunners(deps)
        this.historyFilePath = historyFilePath
    }

    /** 写入 Session 启动事件，记录配置与 token 限制。 */
    async init() {
        await this.emitEvent('session_start', {
            meta: {
                mode: this.mode,
                tokenizer: this.tokenCounter.model,
                warnPromptTokens: this.options.warnPromptTokens,
                maxPromptTokens: this.options.maxPromptTokens,
            },
        })
    }

    /** 执行一次 Turn：接受用户输入，走 ReAct 循环，返回最终结果与步骤轨迹。 */
    async runTurn(input: string): Promise<TurnResult> {
        const abortController = new AbortController()
        this.currentAbortController = abortController
        this.cancelling = false
        this.turnIndex += 1
        const turn = this.turnIndex
        const steps: AgentStepTrace[] = []
        const turnUsage = emptyUsage()
        const turnStartedAt = Date.now()

        // 写入用户消息
        this.history.push({ role: 'user', content: input })

        try {
            const promptTokens = this.tokenCounter.countMessages(this.history)
            await this.emitEvent('turn_start', {
                turn,
                content: input,
                meta: { tokens: { prompt: promptTokens } },
            })
            await runHook(this.hooks, 'onTurnStart', {
                sessionId: this.id,
                turn,
                input,
                promptTokens,
                history: snapshotHistory(this.history),
            })

            let finalText = ''
            let status: TurnStatus = 'ok'
            let errorMessage: string | undefined

            // ReAct 主循环
            for (let step = 0; ; step++) {
                const estimatedPrompt = this.tokenCounter.countMessages(this.history)
                if (
                    this.options.maxPromptTokens &&
                    estimatedPrompt > this.options.maxPromptTokens
                ) {
                    const limitMessage = `Context tokens (${estimatedPrompt}) exceed the limit. Please shorten the input or restart the session.`
                    const finalPayload = JSON.stringify({ final: limitMessage })
                    this.history.push({ role: 'assistant', content: finalPayload })
                    status = 'prompt_limit'
                    finalText = limitMessage
                    errorMessage = limitMessage
                    await this.emitEvent('final', {
                        turn,
                        step,
                        content: limitMessage,
                        role: 'assistant',
                        meta: { tokens: { prompt: estimatedPrompt } },
                    })
                    await runHook(this.hooks, 'onFinal', {
                        sessionId: this.id,
                        turn,
                        step,
                        finalText: limitMessage,
                        status,
                        errorMessage,
                        turnUsage: { ...turnUsage },
                        steps,
                    })
                    break
                }
                if (
                    this.options.warnPromptTokens &&
                    estimatedPrompt > this.options.warnPromptTokens
                ) {
                    console.warn(`Prompt tokens are near the limit: ${estimatedPrompt}`)
                }

                let assistantText = ''
                let toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = []
                let usageFromLLM: Partial<TokenUsage> | undefined
                let streamed = false
                let stopReason: string | undefined
                try {
                    const llmResult = await this.deps.callLLM(
                        this.history,
                        (chunk) => this.deps.onAssistantStep?.(chunk, step),
                        { signal: abortController.signal },
                    )
                    const normalized = normalizeLLMResponse(llmResult)
                    assistantText = normalized.textContent
                    toolUseBlocks = normalized.toolUseBlocks
                    stopReason = normalized.stopReason
                    usageFromLLM = normalized.usage
                    streamed = Boolean(normalized.streamed)
                } catch (err) {
                    if (this.cancelling && isAbortError(err)) {
                        status = 'cancelled'
                        finalText = ''
                        errorMessage = 'Turn cancelled'
                        await this.emitEvent('final', {
                            turn,
                            step,
                            content: '',
                            role: 'assistant',
                            meta: { cancelled: true },
                        })
                        await runHook(this.hooks, 'onFinal', {
                            sessionId: this.id,
                            turn,
                            step,
                            finalText,
                            status,
                            errorMessage,
                            turnUsage: { ...turnUsage },
                            steps,
                        })
                        break
                    }
                    const msg = `LLM call failed: ${(err as Error).message}`
                    const finalPayload = JSON.stringify({ final: msg })
                    this.history.push({ role: 'assistant', content: finalPayload })
                    status = 'error'
                    finalText = msg
                    errorMessage = msg
                    await this.emitEvent('final', { turn, content: msg, role: 'assistant' })
                    await runHook(this.hooks, 'onFinal', {
                        sessionId: this.id,
                        turn,
                        step,
                        finalText,
                        status,
                        errorMessage,
                        turnUsage: { ...turnUsage },
                        steps,
                    })
                    break
                }

                if (!streamed) {
                    this.deps.onAssistantStep?.(assistantText, step)
                }

                // 优先使用 Tool Use API 的结果，降级到 JSON 解析
                let parsed: ParsedAssistant
                if (toolUseBlocks.length > 0) {
                    // Tool Use API 模式：使用结构化的工具调用
                    // 如果有多个工具，只取第一个（保持向后兼容）
                    const firstTool = toolUseBlocks[0]
                    if (firstTool) {
                        const thinking = assistantText ? buildThinking([assistantText]) : undefined
                        parsed = {
                            action: {
                                tool: firstTool.name,
                                input: firstTool.input,
                            },
                            thinking,
                        }
                    } else {
                        parsed = {}
                    }
                } else if (assistantText) {
                    // 降级到 JSON 解析模式（兼容不支持 Tool Use 的模型）
                    parsed = parseAssistant(assistantText)
                } else {
                    // 没有内容，视为空响应
                    parsed = {}
                }

                const historyContent = parsed.action
                    ? JSON.stringify({
                          tool: parsed.action.tool,
                          input: parsed.action.input,
                      })
                    : parsed.final
                    ? JSON.stringify({ final: parsed.final })
                    : assistantText
                this.history.push({ role: 'assistant', content: historyContent })

                // 将本地 tokenizer 与 LLM usage（若有）结合，记录 step 级 token 数据。
                const completionTokens = this.tokenCounter.countText(assistantText)
                const promptUsed = usageFromLLM?.prompt ?? estimatedPrompt
                const completionUsed = usageFromLLM?.completion ?? completionTokens
                const totalUsed = usageFromLLM?.total ?? promptUsed + completionUsed
                const stepUsage: TokenUsage = {
                    prompt: promptUsed,
                    completion: completionUsed,
                    total: totalUsed,
                }
                accumulateUsage(turnUsage, stepUsage)
                accumulateUsage(this.sessionUsage, stepUsage)

                steps.push({
                    index: step,
                    assistantText,
                    parsed,
                    tokenUsage: stepUsage,
                })

                await this.emitEvent('assistant', {
                    turn,
                    step,
                    content: assistantText,
                    role: 'assistant',
                    meta: { tokens: stepUsage },
                })

                // 处理工具调用（支持并发执行多个工具）
                if (toolUseBlocks.length > 1) {
                    // Tool Use API 模式：并发执行所有工具
                    const toolResults = await Promise.allSettled(
                        toolUseBlocks.map(async (toolBlock) => {
                            const tool = this.deps.tools[toolBlock.name]
                            if (!tool) {
                                return {
                                    id: toolBlock.id,
                                    tool: toolBlock.name,
                                    observation: `Unknown tool: ${toolBlock.name}`,
                                }
                            }

                            try {
                                const parsedInput = parseToolInput(tool, toolBlock.input)
                                if (!parsedInput.ok) {
                                    return {
                                        id: toolBlock.id,
                                        tool: toolBlock.name,
                                        observation: parsedInput.error,
                                    }
                                }

                                const result = await tool.execute(parsedInput.data)
                                const observation =
                                    flattenCallToolResult(result) || '(no tool output)'
                                return {
                                    id: toolBlock.id,
                                    tool: toolBlock.name,
                                    observation,
                                }
                            } catch (err) {
                                return {
                                    id: toolBlock.id,
                                    tool: toolBlock.name,
                                    observation: `Tool execution failed: ${(err as Error).message}`,
                                }
                            }
                        }),
                    )

                    // 触发 action hooks（并发调用时，为第一个工具调用 onAction）
                    await this.emitEvent('action', {
                        turn,
                        step,
                        meta: {
                            tools: toolUseBlocks.map((b) => b.name),
                            parallel: true,
                            thinking: parsed.thinking,
                            // 保存所有工具的完整信息
                            toolBlocks: toolUseBlocks.map((b) => ({
                                name: b.name,
                                input: b.input,
                            })),
                        },
                    })
                    // 为了 TUI 兼容性，触发第一个工具的 onAction hook
                    const firstTool = toolUseBlocks[0]
                    if (firstTool) {
                        await runHook(this.hooks, 'onAction', {
                            sessionId: this.id,
                            turn,
                            step,
                            action: {
                                tool: firstTool.name,
                                input: firstTool.input,
                            },
                            thinking: parsed.thinking,
                            history: snapshotHistory(this.history),
                        })
                    }

                    // 汇总所有观察结果
                    const observations: string[] = []
                    for (const [idx, result] of toolResults.entries()) {
                        if (result.status === 'fulfilled') {
                            const { tool, observation } = result.value
                            observations.push(`[${tool}]: ${observation}`)
                            await this.emitEvent('observation', {
                                turn,
                                step,
                                content: observation,
                                meta: { tool, index: idx },
                            })
                        } else {
                            observations.push(`[error]: ${result.reason}`)
                        }
                    }

                    const combinedObservation = observations.join('\n\n')
                    this.history.push({
                        role: 'user',
                        content: JSON.stringify({ observation: combinedObservation }),
                    })
                    const lastStep = steps[steps.length - 1]
                    if (lastStep) {
                        lastStep.observation = combinedObservation
                    }
                    // 触发 observation hook（使用合并后的结果）
                    await runHook(this.hooks, 'onObservation', {
                        sessionId: this.id,
                        turn,
                        step,
                        tool: toolUseBlocks.map((b) => b.name).join(', '),
                        observation: combinedObservation,
                        history: snapshotHistory(this.history),
                    })
                    continue
                }

                // 单个工具调用（向后兼容模式）
                if (parsed.action) {
                    await this.emitEvent('action', {
                        turn,
                        step,
                        meta: {
                            tool: parsed.action.tool,
                            input: parsed.action.input,
                            thinking: parsed.thinking,
                        },
                    })
                    await runHook(this.hooks, 'onAction', {
                        sessionId: this.id,
                        turn,
                        step,
                        action: parsed.action,
                        thinking: parsed.thinking,
                        history: snapshotHistory(this.history),
                    })

                    const tool = this.deps.tools[parsed.action.tool]
                    let observation: string
                    try {
                        if (tool) {
                            const parsedInput = parseToolInput(tool, parsed.action.input)
                            if (!parsedInput.ok) {
                                observation = parsedInput.error
                            } else {
                                const result = await tool.execute(parsedInput.data)
                                observation = flattenCallToolResult(result) || '(no tool output)'
                            }
                        } else {
                            observation = `Unknown tool: ${parsed.action.tool}`
                        }
                    } catch (err) {
                        observation = `Tool execution failed: ${(err as Error).message}`
                    }

                    this.history.push({
                        role: 'user',
                        content: JSON.stringify({ observation, tool: parsed.action.tool }),
                    })
                    const lastStep = steps[steps.length - 1]
                    if (lastStep) {
                        lastStep.observation = observation
                    }
                    await this.emitEvent('observation', {
                        turn,
                        step,
                        content: observation,
                        meta: { tool: parsed.action.tool },
                    })
                    await runHook(this.hooks, 'onObservation', {
                        sessionId: this.id,
                        turn,
                        step,
                        tool: parsed.action.tool,
                        observation,
                        history: snapshotHistory(this.history),
                    })
                    continue
                }

                // 检查是否是最终回复（end_turn 或有 final 字段）
                if (stopReason === 'end_turn' || parsed.final) {
                    finalText = parsed.final || assistantText
                    if (parsed.final) {
                        parsed.final = finalText
                    }
                    await this.emitEvent('final', {
                        turn,
                        step,
                        content: finalText,
                        role: 'assistant',
                        meta: { tokens: stepUsage },
                    })
                    await runHook(this.hooks, 'onFinal', {
                        sessionId: this.id,
                        turn,
                        step,
                        finalText,
                        status,
                        tokenUsage: stepUsage,
                        turnUsage: { ...turnUsage },
                        steps,
                    })
                    break
                }

                break
            }

            if (!finalText && status !== 'cancelled') {
                if (status === 'ok') {
                    status = 'error'
                }
                finalText = 'Unable to produce a final answer. Please retry or adjust the request.'
                errorMessage = finalText
                const payload = JSON.stringify({ final: finalText })
                this.history.push({ role: 'assistant', content: payload })
                await this.emitEvent('final', {
                    turn,
                    content: finalText,
                    role: 'assistant',
                })
                await runHook(this.hooks, 'onFinal', {
                    sessionId: this.id,
                    turn,
                    finalText,
                    status,
                    errorMessage,
                    turnUsage: { ...turnUsage },
                    steps,
                })
            }

            await this.emitEvent('turn_end', {
                turn,
                meta: {
                    status,
                    stepCount: steps.length,
                    durationMs: Date.now() - turnStartedAt,
                    tokens: turnUsage,
                },
            })

            return {
                finalText,
                steps,
                status,
                errorMessage,
                tokenUsage: turnUsage,
            }
        } finally {
            this.currentAbortController = null
            this.cancelling = false
        }
    }

    cancelCurrentTurn() {
        if (this.currentAbortController) {
            this.cancelling = true
            this.currentAbortController.abort()
        }
    }

    async close() {
        if (this.closed) return
        this.closed = true
        await this.emitEvent('session_end', {
            meta: {
                durationMs: Date.now() - this.startedAt,
                tokens: this.sessionUsage,
            },
        })
        for (const sink of this.sinks) {
            if (sink.flush) {
                try {
                    await sink.flush()
                } catch (err) {
                    console.error(`History flush failed: ${(err as Error).message}`)
                }
            }
        }
        this.tokenCounter.dispose()
        if (this.deps.dispose) {
            await this.deps.dispose()
        }
    }

    /** 将结构化事件发送到所有历史 sink，独立于主流程错误。 */
    private async emitEvent(
        type: HistoryEvent['type'],
        payload: Omit<HistoryEvent, 'ts' | 'sessionId' | 'type'>,
    ) {
        if (!this.sinks.length) return
        const event = createHistoryEvent({
            sessionId: this.id,
            type,
            turn: payload.turn,
            step: payload.step,
            content: payload.content,
            role: payload.role,
            meta: payload.meta,
        })
        await emitEventToSinks(event, this.sinks)
    }
}

/**
 * 创建一个 Agent Session，支持多轮对话与 JSONL 事件记录。
 */
export async function createAgentSession(
    deps: AgentSessionDeps,
    options: AgentSessionOptions = {},
): Promise<AgentSession> {
    const sessionId = options.sessionId || randomUUID()
    const resolved = await withDefaultDeps(deps, { ...options, sessionId }, sessionId)
    const systemPrompt = await resolved.loadPrompt()
    const session = new AgentSessionImpl(
        { ...(deps as AgentSessionDeps), ...resolved },
        { ...options, sessionId, mode: options.mode ?? DEFAULT_SESSION_MODE },
        systemPrompt,
        resolved.tokenCounter,
        resolved.historyFilePath,
    )
    await session.init()
    return session
}
