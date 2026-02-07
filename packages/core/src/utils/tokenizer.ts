/** @file tiktoken wrapper: for prompt/response token counting and encoding management. */
import { encoding_for_model, get_encoding, type Tiktoken } from '@dqbd/tiktoken'
import type { ChatMessage, TokenCounter } from '@memo/core/types'

const DEFAULT_TOKENIZER_MODEL = 'cl100k_base'

type EncodingFactory = () => Tiktoken

function safeEncodingFactory(model?: string): { model: string; factory: EncodingFactory } {
    const resolvedModel = model?.trim() || DEFAULT_TOKENIZER_MODEL
    try {
        // encoding_for_model requires strict model names; using type assertion for dynamic input compatibility.
        const factory = () => encoding_for_model(resolvedModel as any)
        factory().free()
        return { model: resolvedModel, factory }
    } catch {
        // Fallback to generic cl100k_base for unknown models to avoid throwing.
        const fallbackModel = DEFAULT_TOKENIZER_MODEL
        const factory = () => get_encoding(fallbackModel)
        factory().free()
        return { model: fallbackModel, factory }
    }
}

function messagePayloadForCounting(message: ChatMessage): string {
    if (message.role === 'assistant' && message.tool_calls?.length) {
        return `${message.content}\n${JSON.stringify(message.tool_calls)}`
    }
    if (message.role === 'tool') {
        return `${message.content}\n${message.tool_call_id}\n${message.name ?? ''}`
    }
    return message.content
}

/** Create a reusable tokenizer counter for prompt estimation and usage reconciliation. */
export function createTokenCounter(model?: string): TokenCounter {
    const { model: resolvedModel, factory } = safeEncodingFactory(model)
    const encoding = factory()

    // ChatML rough estimation: each message includes role/name wrapping overhead
    // Reference OpenAI's common estimates for gpt-3.5/4: about 4 tokens per message, plus 2 tokens for assistant priming.
    const TOKENS_PER_MESSAGE = 4
    const TOKENS_FOR_ASSISTANT_PRIMING = 2
    const TOKENS_PER_NAME = 1

    const countText = (text: string) => {
        if (!text) return 0
        return encoding.encode(text).length
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
        dispose: () => encoding.free(),
    }
}
