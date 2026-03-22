/** @file Lightweight token estimator used for context monitoring and fallback accounting. */
import type { ChatMessage, TokenCounter } from '@memo/core/types'

const DEFAULT_TOKENIZER_MODEL = 'cl100k_base'

const KNOWN_MODEL_ALIASES = new Set([
    'cl100k_base',
    'gpt-4',
    'gpt-4o',
    'gpt-4.1',
    'gpt-5',
    'o1',
    'o3',
    'o4',
    'deepseek-chat',
    'deepseek-reasoner',
    'claude-3-5-sonnet',
    'gemini-2.5-pro',
])

const KNOWN_MODEL_PATTERNS = [
    /^gpt[-_.a-z0-9]+$/i,
    /^o[1-9][-_.a-z0-9]*$/i,
    /^claude[-_.a-z0-9]+$/i,
    /^gemini[-_.a-z0-9]+$/i,
    /^deepseek[-_.a-z0-9]+$/i,
    /^qwen[-_.a-z0-9]+$/i,
    /^llama[-_.a-z0-9]+$/i,
    /^mistral[-_.a-z0-9]+$/i,
    /^[a-z0-9]+\/[a-z0-9][-_.a-z0-9]*$/i,
]

function normalizeModelName(model?: string): string {
    return model?.trim() || DEFAULT_TOKENIZER_MODEL
}

function isKnownModelAlias(model: string): boolean {
    if (KNOWN_MODEL_ALIASES.has(model.toLowerCase())) return true
    return KNOWN_MODEL_PATTERNS.some((pattern) => pattern.test(model))
}

function toResolvedModel(model?: string): string {
    const normalized = normalizeModelName(model)
    return isKnownModelAlias(normalized) ? normalized : DEFAULT_TOKENIZER_MODEL
}

function isCjkCodePoint(codePoint: number): boolean {
    return (
        (codePoint >= 0x3040 && codePoint <= 0x30ff) || // hiragana / katakana
        (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // cjk ext a
        (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // cjk unified ideographs
        (codePoint >= 0xac00 && codePoint <= 0xd7af)
    ) // hangul syllables
}

function estimateTextTokens(text: string): number {
    if (!text) return 0

    let asciiUnits = 0
    let cjkUnits = 0
    let otherUnits = 0
    let punctuationUnits = 0
    let newlineUnits = 0

    for (const char of text) {
        const codePoint = char.codePointAt(0)
        if (!codePoint) continue

        if (char === '\n') newlineUnits += 1
        if (/\s/u.test(char)) {
            asciiUnits += 0.15
            continue
        }
        if (isCjkCodePoint(codePoint)) {
            cjkUnits += 1
            continue
        }

        if (codePoint <= 0x7f) {
            asciiUnits += 1
            if (
                (codePoint >= 33 && codePoint <= 47) ||
                (codePoint >= 58 && codePoint <= 64) ||
                (codePoint >= 91 && codePoint <= 96) ||
                (codePoint >= 123 && codePoint <= 126)
            ) {
                punctuationUnits += 1
            }
            continue
        }

        otherUnits += 1
    }

    const estimated =
        asciiUnits / 4 + cjkUnits + otherUnits * 0.75 + punctuationUnits * 0.12 + newlineUnits * 0.4

    return Math.max(1, Math.ceil(estimated))
}

function messagePayloadForCounting(message: ChatMessage): string {
    if (message.role === 'assistant') {
        const reasoning = message.reasoning_content ? `\n${message.reasoning_content}` : ''
        if (message.tool_calls?.length) {
            return `${message.content}${reasoning}\n${JSON.stringify(message.tool_calls)}`
        }
        return `${message.content}${reasoning}`
    }
    if (message.role === 'tool') {
        return `${message.content}\n${message.tool_call_id}\n${message.name ?? ''}`
    }
    return message.content
}

/** Create a reusable tokenizer counter for prompt estimation and usage reconciliation. */
export function createTokenCounter(model?: string): TokenCounter {
    const resolvedModel = toResolvedModel(model)

    // ChatML rough estimation: each message includes role/name wrapping overhead
    // Reference OpenAI's common estimates for gpt-3.5/4: about 4 tokens per message, plus 2 tokens for assistant priming.
    const TOKENS_PER_MESSAGE = 4
    const TOKENS_FOR_ASSISTANT_PRIMING = 2
    const TOKENS_PER_NAME = 1

    const countText = (text: string) => {
        return estimateTextTokens(text)
    }

    const countMessages = (messages: ChatMessage[]) => {
        if (!messages.length) return 0
        let total = 0
        for (const message of messages) {
            total += TOKENS_PER_MESSAGE
            total += countText(messagePayloadForCounting(message))
            // Currently not using message.name, but add overhead when name field is reserved
            if ((message as any).name) {
                total += TOKENS_PER_NAME
            }
        }
        total += TOKENS_FOR_ASSISTANT_PRIMING
        return total
    }

    return {
        model: resolvedModel,
        countText,
        countMessages,
        dispose: () => {},
    }
}
