import OpenAI from 'openai'
import type { ModelProfileOverride, ProviderConfig } from '@memo/core/config/config'
import type { ToolDefinition } from '@memo/core/types'

export type ModelWireApi = 'chat_completions'

export type ModelProfile = {
    wireApi: ModelWireApi
    supportsParallelToolCalls: boolean
    supportsReasoningContent: boolean
    supportsVerbosity: boolean
    contextWindow?: number
    isFallback: boolean
}

type ProfileCapabilities = Omit<ModelProfile, 'wireApi' | 'isFallback'>

const CONSERVATIVE_FALLBACK_PROFILE: ProfileCapabilities = {
    supportsParallelToolCalls: false,
    supportsReasoningContent: false,
    supportsVerbosity: false,
}

export type ResolvedModelProfile = {
    profile: ModelProfile
    warning?: string
}

function normalizeToken(value: string): string {
    return value.trim().toLowerCase()
}

function resolveOverride(
    providerName: string,
    modelSlug: string,
    overrides: Record<string, ModelProfileOverride> | undefined,
): ModelProfileOverride | undefined {
    if (!overrides) return undefined

    const normalizedOverrides = new Map<string, ModelProfileOverride>()
    for (const [key, value] of Object.entries(overrides)) {
        normalizedOverrides.set(normalizeToken(key), value)
    }

    const providerSpecific = normalizedOverrides.get(`${providerName}:${modelSlug}`)
    if (providerSpecific) return providerSpecific
    return normalizedOverrides.get(modelSlug)
}

function applyOverride(
    base: ProfileCapabilities,
    override: ModelProfileOverride | undefined,
): { capabilities: ProfileCapabilities; usedOverride: boolean } {
    if (!override) return { capabilities: base, usedOverride: false }

    const next: ProfileCapabilities = { ...base }
    let usedOverride = false

    if (typeof override.supports_parallel_tool_calls === 'boolean') {
        next.supportsParallelToolCalls = override.supports_parallel_tool_calls
        usedOverride = true
    }
    if (typeof override.supports_reasoning_content === 'boolean') {
        next.supportsReasoningContent = override.supports_reasoning_content
        usedOverride = true
    }
    if (typeof override.supports_verbosity === 'boolean') {
        next.supportsVerbosity = override.supports_verbosity
        usedOverride = true
    }
    if (
        typeof override.context_window === 'number' &&
        Number.isFinite(override.context_window) &&
        override.context_window > 0
    ) {
        next.contextWindow = Math.floor(override.context_window)
        usedOverride = true
    }

    return { capabilities: next, usedOverride }
}

export function resolveModelProfile(
    provider: Pick<ProviderConfig, 'name' | 'model'>,
    overrides?: Record<string, ModelProfileOverride>,
): ResolvedModelProfile {
    const providerName = normalizeToken(provider.name)
    const modelSlug = normalizeToken(provider.model)
    const { capabilities, usedOverride } = applyOverride(
        CONSERVATIVE_FALLBACK_PROFILE,
        resolveOverride(providerName, modelSlug, overrides),
    )

    return {
        profile: {
            wireApi: 'chat_completions',
            ...capabilities,
            isFallback: !usedOverride,
        },
    }
}

function toChatCompletionTools(toolDefinitions: ToolDefinition[]) {
    if (toolDefinitions.length === 0) return undefined

    return toolDefinitions.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        },
    }))
}

export function buildChatCompletionRequest(params: {
    model: string
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    toolDefinitions: ToolDefinition[]
    profile: ModelProfile
}): OpenAI.Chat.Completions.ChatCompletionCreateParams {
    const tools = toChatCompletionTools(params.toolDefinitions)
    const request: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: params.model,
        messages: params.messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
    }

    if (tools && params.profile.supportsParallelToolCalls) {
        ;(request as Record<string, unknown>).parallel_tool_calls = true
    }

    return request
}
