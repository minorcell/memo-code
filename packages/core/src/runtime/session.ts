/** @file Session/Turn runtime core: handles ReAct loop, tool scheduling, and event logging. */
import { randomUUID } from 'node:crypto'
import { createHistoryEvent } from '@memo/core/runtime/history'
import { withDefaultDeps } from '@memo/core/runtime/defaults'
import { buildThinking } from '@memo/core/utils/utils'
import type {
    ChatMessage,
    AssistantToolCall,
    AgentSession,
    AgentSessionDeps,
    AgentSessionOptions,
    AgentStepTrace,
    HistoryEvent,
    HistorySink,
    LLMResponse,
    ParsedAssistant,
    SessionMode,
    ToolPermissionMode,
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
import {
    createToolOrchestrator,
    type ToolApprovalHooks,
    type ToolOrchestrator,
    type ToolActionResult,
    type ToolActionStatus,
} from '@memo/tools/orchestrator'
import type { ApprovalRequest, ApprovalDecision } from '@memo/tools/approval'

const DEFAULT_SESSION_MODE: SessionMode = 'interactive'
const DEFAULT_MAX_PROMPT_TOKENS = 120_000
const TOOL_ACTION_SUCCESS_STATUS: ToolActionStatus = 'success'
const TOOL_DISABLED_ERROR_MESSAGE =
    'Tool usage is disabled in the current permission mode. Switch to /tools once or /tools full to enable tools.'

type ResolvedToolPermission = {
    mode: ToolPermissionMode | 'auto'
    toolsDisabled: boolean
    dangerous: boolean
    approvalMode: 'auto' | 'strict'
}

function resolveToolPermission(options: AgentSessionOptions): ResolvedToolPermission {
    if (options.toolPermissionMode === 'none') {
        return {
            mode: 'none',
            toolsDisabled: true,
            dangerous: false,
            approvalMode: 'auto',
        }
    }

    if (options.toolPermissionMode === 'once') {
        return {
            mode: 'once',
            toolsDisabled: false,
            dangerous: false,
            approvalMode: 'strict',
        }
    }

    if (options.toolPermissionMode === 'full') {
        return {
            mode: 'full',
            toolsDisabled: false,
            dangerous: true,
            approvalMode: 'auto',
        }
    }

    const dangerous = options.dangerous ?? false
    return {
        mode: dangerous ? 'full' : 'auto',
        toolsDisabled: false,
        dangerous,
        approvalMode: 'auto',
    }
}

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
} {
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
        stopReason: raw.stop_reason,
        usage: raw.usage,
    }
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

function isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError'
}

// Stable serialization for duplicate action detection (ensures consistent key ordering)
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableStringify(v)).join(',')}]`
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

function buildAssistantToolCalls(
    toolUseBlocks: Array<{ id: string; name: string; input: unknown }>,
): AssistantToolCall[] {
    return toolUseBlocks.map((block) => ({
        id: block.id,
        type: 'function',
        function: {
            name: block.name,
            arguments: stableStringify(block.input),
        },
    }))
}

function parseTextToolCall(
    text: string,
    tools: ToolRegistry,
): { tool: string; input: unknown } | null {
    const trimmed = text.trim()
    if (!trimmed) return null

    const candidates = [trimmed]
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    if (fenced?.[1]) {
        candidates.push(fenced[1].trim())
    }

    for (const candidate of candidates) {
        if (!candidate.startsWith('{') || !candidate.endsWith('}')) continue
        try {
            const parsed = JSON.parse(candidate)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
            const obj = parsed as Record<string, unknown>
            const tool = typeof obj.tool === 'string' ? obj.tool.trim() : ''
            if (!tool || !Object.prototype.hasOwnProperty.call(tools, tool)) continue
            return { tool, input: obj.input ?? {} }
        } catch {
            // Ignore invalid json
        }
    }

    return null
}

/** In-process conversation Session, implements multi-turn execution and log writing. */
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
    private sessionStartEmitted = false
    private currentAbortController: AbortController | null = null
    private cancelling = false
    private lastActionSignature: string | null = null
    private repeatedActionCount = 0
    private toolOrchestrator: ToolOrchestrator
    private toolsDisabled = false
    private toolPermissionMode: ToolPermissionMode | 'auto' = 'auto'

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
        const resolvedPermission = resolveToolPermission(options)
        this.toolsDisabled = resolvedPermission.toolsDisabled
        this.toolPermissionMode = resolvedPermission.mode
        this.toolOrchestrator = createToolOrchestrator({
            tools: deps.tools,
            approval: {
                dangerous: resolvedPermission.dangerous,
                mode: resolvedPermission.approvalMode,
            },
        })
    }

    /** 初始化：延迟写入 session_start，避免空会话落盘。 */
    async init() {
        // 留空，等第一次 runTurn 时再写 session_start 事件
    }

    private resetActionRepetition() {
        this.lastActionSignature = null
        this.repeatedActionCount = 0
    }

    private maybeWarnRepeatedAction(tool: string, input: unknown) {
        const signature = `${tool}:${stableStringify(input)}`
        if (this.lastActionSignature === signature) {
            this.repeatedActionCount += 1
        } else {
            this.lastActionSignature = signature
            this.repeatedActionCount = 1
        }

        if (this.repeatedActionCount === 3) {
            const preview = stableStringify(input).slice(0, 200)
            const warning = `系统提醒：你已连续3次调用同一工具「${tool}」且参数相同（${preview}${
                preview.length >= 200 ? '…' : ''
            }）。请确认是否陷入循环，必要时直接给出最终回答或调整参数。`
            this.history.push({ role: 'system', content: warning })
        }
    }

    private buildToolApprovalHooks(turn: number, step: number): ToolApprovalHooks {
        return {
            onApprovalRequest: async (request: ApprovalRequest) => {
                await runHook(this.hooks, 'onApprovalRequest', {
                    sessionId: this.id,
                    turn,
                    step,
                    request,
                })
            },
            requestApproval: async (request: ApprovalRequest): Promise<ApprovalDecision> => {
                if (this.deps.requestApproval) {
                    return this.deps.requestApproval(request)
                }
                return 'deny'
            },
            onApprovalResponse: async ({ fingerprint, decision }) => {
                await runHook(this.hooks, 'onApprovalResponse', {
                    sessionId: this.id,
                    turn,
                    step,
                    fingerprint,
                    decision,
                })
            },
        }
    }

    /** 通过工具编排器执行工具调用。 */
    private async executeToolAction(
        actionId: string,
        toolName: string,
        toolInput: unknown,
        turn: number,
        step: number,
    ): Promise<ToolActionResult> {
        return this.toolOrchestrator.executeAction(
            { id: actionId, name: toolName, input: toolInput },
            this.buildToolApprovalHooks(turn, step),
        )
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
        const effectiveMaxPromptTokens = this.options.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS

        if (!this.sessionStartEmitted) {
            const systemPrompt =
                this.history[0]?.role === 'system' ? this.history[0].content : undefined
            await this.emitEvent('session_start', {
                content: systemPrompt,
                role: systemPrompt ? 'system' : undefined,
                meta: {
                    mode: this.mode,
                    cwd: process.cwd(),
                    tokenizer: this.tokenCounter.model,
                    warnPromptTokens: this.options.warnPromptTokens,
                    maxPromptTokens: effectiveMaxPromptTokens,
                    toolPermissionMode: this.toolPermissionMode,
                },
            })
            this.sessionStartEmitted = true
        }

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
            let protocolViolationCount = 0
            let lastNonEmptyAssistantText: string | null = null
            let lastNonEmptyAssistantStep = -1

            // ReAct 主循环
            for (let step = 0; ; step++) {
                const estimatedPrompt = this.tokenCounter.countMessages(this.history)
                if (estimatedPrompt > effectiveMaxPromptTokens) {
                    const limitMessage = `Context tokens (${estimatedPrompt}) exceed the limit. Please shorten the input or restart the session.`
                    this.history.push({ role: 'assistant', content: limitMessage })
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
                    if (assistantText.trim().length > 0) {
                        lastNonEmptyAssistantText = assistantText
                        lastNonEmptyAssistantStep = step
                    }
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
                    this.history.push({ role: 'assistant', content: msg })
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

                this.deps.onAssistantStep?.(assistantText, step)

                const textToolCall =
                    toolUseBlocks.length === 0 && assistantText
                        ? parseTextToolCall(assistantText, this.deps.tools)
                        : null

                // 优先使用 Tool Use API 的结果；文本仅作为最终回答处理。
                let parsed: ParsedAssistant
                let assistantHistoryMessage: ChatMessage | null = null
                if (toolUseBlocks.length > 0) {
                    // Tool Use API 模式：使用结构化的工具调用。
                    // parsed.action 复用单 action 结构，取首个工具作为主 action 语义。
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
                        assistantHistoryMessage = {
                            role: 'assistant',
                            content: assistantText,
                            tool_calls: buildAssistantToolCalls(toolUseBlocks),
                        }
                    } else {
                        parsed = {}
                    }
                } else if (assistantText) {
                    parsed = { final: assistantText }
                    assistantHistoryMessage = { role: 'assistant', content: assistantText }
                } else {
                    // 没有内容，视为空响应
                    parsed = {}
                }

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
                    meta: {
                        tokens: stepUsage,
                        protocol_violation: Boolean(textToolCall),
                        protocol_violation_count: textToolCall
                            ? protocolViolationCount + 1
                            : protocolViolationCount || undefined,
                    },
                })

                if (textToolCall) {
                    protocolViolationCount += 1

                    const protocolError = `Model protocol error: returned plain-text tool JSON for "${textToolCall.tool}" ${protocolViolationCount} times. Structured tool calls are required.`
                    status = 'error'
                    finalText = protocolError
                    errorMessage = protocolError
                    this.history.push({ role: 'assistant', content: protocolError })
                    await this.emitEvent('final', {
                        turn,
                        step,
                        content: protocolError,
                        role: 'assistant',
                        meta: {
                            error_type: 'model_protocol_error',
                            tool: textToolCall.tool,
                            protocol_violation: true,
                            protocol_violation_count: protocolViolationCount,
                            tokens: stepUsage,
                        },
                    })
                    await runHook(this.hooks, 'onFinal', {
                        sessionId: this.id,
                        turn,
                        step,
                        finalText,
                        status,
                        errorMessage,
                        tokenUsage: stepUsage,
                        turnUsage: { ...turnUsage },
                        steps,
                    })
                    break
                }

                if (assistantHistoryMessage) {
                    this.history.push(assistantHistoryMessage)
                }

                if (toolUseBlocks.length > 0 && this.toolsDisabled) {
                    status = 'error'
                    finalText = TOOL_DISABLED_ERROR_MESSAGE
                    errorMessage = TOOL_DISABLED_ERROR_MESSAGE
                    this.history.push({ role: 'assistant', content: TOOL_DISABLED_ERROR_MESSAGE })
                    await this.emitEvent('final', {
                        turn,
                        step,
                        content: TOOL_DISABLED_ERROR_MESSAGE,
                        role: 'assistant',
                        meta: {
                            error_type: 'tool_disabled',
                            tool_count: toolUseBlocks.length,
                            tools: toolUseBlocks.map((block) => block.name).join(','),
                            tokens: stepUsage,
                        },
                    })
                    await runHook(this.hooks, 'onFinal', {
                        sessionId: this.id,
                        turn,
                        step,
                        finalText: TOOL_DISABLED_ERROR_MESSAGE,
                        status,
                        errorMessage,
                        tokenUsage: stepUsage,
                        turnUsage: { ...turnUsage },
                        steps,
                    })
                    break
                }

                // 处理工具调用（支持并发执行多个工具）
                if (toolUseBlocks.length > 1) {
                    // 重复调用防呆：对每个工具调用记录签名
                    for (const block of toolUseBlocks) {
                        this.maybeWarnRepeatedAction(block.name, block.input)
                    }

                    // 触发 action hooks（action 字段取首个工具，parallelActions 包含全量）
                    await this.emitEvent('action', {
                        turn,
                        step,
                        meta: {
                            tools: toolUseBlocks.map((b) => b.name),
                            action_ids: toolUseBlocks.map((b) => b.id),
                            action_id: toolUseBlocks[0]?.id,
                            parallel: true,
                            phase: 'dispatch',
                            thinking: parsed.thinking,
                            // 保存所有工具的完整信息
                            toolBlocks: toolUseBlocks.map((b) => ({
                                id: b.id,
                                name: b.name,
                                input: b.input,
                            })),
                        },
                    })
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
                            parallelActions: toolUseBlocks.map((block) => ({
                                tool: block.name,
                                input: block.input,
                            })),
                            thinking: parsed.thinking,
                            history: snapshotHistory(this.history),
                        })
                    }

                    const allSupportParallel = toolUseBlocks.every((block) => {
                        const tool = this.deps.tools[block.name]
                        return Boolean(tool?.supportsParallelToolCalls)
                    })
                    const hasMutatingTool = toolUseBlocks.some((block) => {
                        const tool = this.deps.tools[block.name]
                        return Boolean(tool?.isMutating)
                    })
                    const executionMode =
                        allSupportParallel && !hasMutatingTool ? 'parallel' : 'sequential'

                    const execution = await this.toolOrchestrator.executeActions(
                        toolUseBlocks.map((block) => ({
                            id: block.id,
                            name: block.name,
                            input: block.input,
                        })),
                        {
                            ...this.buildToolApprovalHooks(turn, step),
                            executionMode,
                            failurePolicy: 'fail_fast',
                        },
                    )

                    for (const [idx, result] of execution.results.entries()) {
                        this.history.push({
                            role: 'tool',
                            content: result.observation,
                            tool_call_id: result.actionId,
                            name: result.tool,
                        })
                        await this.emitEvent('observation', {
                            turn,
                            step,
                            content: result.observation,
                            meta: {
                                tool: result.tool,
                                index: idx,
                                action_id: result.actionId,
                                phase: 'result',
                                status: result.status,
                                error_type: result.errorType,
                                duration_ms: result.durationMs,
                                execution_mode: executionMode,
                            },
                        })
                    }

                    const combinedObservation = execution.combinedObservation
                    const parallelResultStatuses = execution.results.map((result) => result.status)
                    const resultStatus =
                        parallelResultStatuses.find(
                            (candidate) => candidate !== TOOL_ACTION_SUCCESS_STATUS,
                        ) ?? TOOL_ACTION_SUCCESS_STATUS
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
                        resultStatus,
                        parallelResultStatuses,
                        history: snapshotHistory(this.history),
                    })

                    // 如果被拒绝，停止本轮次
                    if (execution.hasRejection) {
                        const rejectionResult = execution.results.find((result) => result.rejected)
                        status = 'cancelled'
                        finalText = '用户拒绝了工具执行，已停止当前操作。'
                        await this.emitEvent('final', {
                            turn,
                            step,
                            content: finalText,
                            role: 'assistant',
                            meta: {
                                rejected: true,
                                phase: 'result',
                                action_id: rejectionResult?.actionId,
                                error_type: rejectionResult?.errorType ?? 'approval_denied',
                                duration_ms: rejectionResult?.durationMs,
                            },
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
                    continue
                }

                // 单个工具调用
                // 注意：当 toolUseBlocks.length > 1 时，已在上面处理，这里跳过
                else if (parsed.action) {
                    this.maybeWarnRepeatedAction(parsed.action.tool, parsed.action.input)
                    const actionId =
                        toolUseBlocks[0]?.id ?? `${turn}:${step}:single:${parsed.action.tool}`
                    await this.emitEvent('action', {
                        turn,
                        step,
                        meta: {
                            tool: parsed.action.tool,
                            input: parsed.action.input,
                            action_id: actionId,
                            phase: 'dispatch',
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

                    // 使用审批流程执行工具
                    const result = await this.executeToolAction(
                        actionId,
                        parsed.action.tool,
                        parsed.action.input,
                        turn,
                        step,
                    )

                    // 如果被拒绝，停止本轮次
                    if (result.rejected) {
                        status = 'cancelled'
                        finalText = '用户拒绝了工具执行，已停止当前操作。'
                        await this.emitEvent('final', {
                            turn,
                            step,
                            content: finalText,
                            role: 'assistant',
                            meta: {
                                rejected: true,
                                phase: 'result',
                                action_id: result.actionId,
                                error_type: result.errorType ?? 'approval_denied',
                                duration_ms: result.durationMs,
                            },
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

                    const observation = result.observation

                    this.history.push({
                        role: 'tool',
                        content: observation,
                        tool_call_id: result.actionId,
                        name: parsed.action.tool,
                    })
                    const lastStep = steps[steps.length - 1]
                    if (lastStep) {
                        lastStep.observation = observation
                    }
                    await this.emitEvent('observation', {
                        turn,
                        step,
                        content: observation,
                        meta: {
                            tool: parsed.action.tool,
                            action_id: result.actionId,
                            phase: 'result',
                            status: result.status,
                            error_type: result.errorType,
                            duration_ms: result.durationMs,
                        },
                    })
                    await runHook(this.hooks, 'onObservation', {
                        sessionId: this.id,
                        turn,
                        step,
                        tool: parsed.action.tool,
                        observation,
                        resultStatus: result.status,
                        history: snapshotHistory(this.history),
                    })
                    continue
                }

                // 检查是否是最终回复（end_turn 或有 final 字段）
                if (stopReason === 'end_turn' || parsed.final) {
                    this.resetActionRepetition()
                    const shouldFallbackFromPreviousText =
                        stopReason === 'end_turn' &&
                        !parsed.final &&
                        assistantText.trim().length === 0 &&
                        Boolean(lastNonEmptyAssistantText) &&
                        lastNonEmptyAssistantStep === step - 1

                    finalText = shouldFallbackFromPreviousText
                        ? (lastNonEmptyAssistantText ?? '')
                        : parsed.final || assistantText
                    if (parsed.final) {
                        parsed.final = finalText
                    }
                    await this.emitEvent('final', {
                        turn,
                        step,
                        content: finalText,
                        role: 'assistant',
                        meta: {
                            tokens: stepUsage,
                            fallback_from_previous_text:
                                shouldFallbackFromPreviousText || undefined,
                        },
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

                // 无动作且未结束时，重置重复计数（保持“连续”语义）
                this.resetActionRepetition()
                break
            }

            if (!finalText && status !== 'cancelled') {
                if (status === 'ok') {
                    status = 'error'
                }
                finalText = 'Unable to produce a final answer. Please retry or adjust the request.'
                errorMessage = finalText
                this.history.push({ role: 'assistant', content: finalText })
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
                    protocol_violation_count: protocolViolationCount || undefined,
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
            // 清除单次授权（每次 turn 结束后）
            this.toolOrchestrator.clearOnceApprovals()
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
        const hasContent = this.sessionStartEmitted || this.turnIndex >= 0
        if (hasContent) {
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
        }
        this.tokenCounter.dispose()
        // 清理所有授权
        this.toolOrchestrator.dispose()
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
