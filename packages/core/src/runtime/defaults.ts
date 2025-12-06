import { join } from "node:path"
import { TOOLKIT } from "@memo/tools"
import { callLLM as defaultCallLLM } from "@memo/core/llm/openai"
import { createTokenCounter } from "@memo/core/llm/tokenizer"
import { HISTORY_DIR, JsonlHistorySink } from "@memo/core/runtime/history"
import { loadSystemPrompt as defaultLoadPrompt } from "@memo/core/runtime/prompt"
import type {
    AgentSessionDeps,
    AgentSessionOptions,
    CallLLM,
    HistorySink,
    TokenCounter,
    ToolRegistry,
} from "@memo/core/types"

/**
 * 根据缺省策略补全依赖项（工具、callLLM、prompt、history sinks、tokenizer）。
 * 调用方可仅提供回调/覆盖项，其余使用默认实现。
 */
export function withDefaultDeps(
    deps: AgentSessionDeps,
    options: AgentSessionOptions,
    sessionId: string,
): {
    tools: ToolRegistry
    callLLM: CallLLM
    loadPrompt: () => Promise<string>
    historySinks: HistorySink[]
    tokenCounter: TokenCounter
} {
    const tools = deps.tools ?? TOOLKIT
    const callLLM = deps.callLLM ?? defaultCallLLM
    const loadPrompt = deps.loadPrompt ?? defaultLoadPrompt

    const historySinks = deps.historySinks ?? [
        new JsonlHistorySink(join(options.historyDir ?? HISTORY_DIR, `${sessionId}.jsonl`)),
    ]

    const tokenCounter = deps.tokenCounter ?? createTokenCounter(options.tokenizerModel)

    return { tools, callLLM, loadPrompt, historySinks, tokenCounter }
}
