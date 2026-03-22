# Token Counting Strategy in Memo Code CLI

This document describes how Memo Code CLI estimates and records tokens for prompt budgeting, context-limit protection, and usage reconciliation.

## Counting Implementation

- **Primary source**: prefers model-returned usage (`inputTokens/outputTokens/totalTokens`) from AI SDK calls.
- **Fallback counter**: local lightweight estimator (default model label `cl100k_base`); override via `tokenizerModel`.
- **Plain text count**: `countText(text)` estimates by character mix (ASCII/CJK/symbol/newline weighting).
- **Message array count (ChatML approximation)**: `countMessages(messages)` uses a common OpenAI ChatML estimate:
    - fixed overhead of 4 tokens per message (role/name wrappers, etc.)
    - `content` counted with local estimator
    - if `name` is supported later, adds 1 token
    - adds 2 tokens at the end for assistant priming

This remains an approximation for context budgeting, while runtime accounting prefers provider usage when available.

## Usage Scenarios

- **Prompt budgeting**: before each step, `runTurn` estimates prompt tokens with `countMessages` and applies:
    - `warnPromptTokens`: prints warning
    - `maxPromptTokens`: returns early when exceeded, preventing over-limit LLM requests
- **Usage reconciliation**: each step combines local estimate and AI SDK usage (if available), records into token usage and JSONL history events.

## Precision and Limitations

- Fixed ChatML overhead varies slightly by model. Current "4 per message + 2 ending" estimate may differ by dozens of tokens on specific models.
- Extra structural overhead for tool/function calling is not explicitly modeled yet. For exact reconciliation, prefer provider usage data.
- If using custom `callLLM`, inject custom `tokenCounter` when you need model-specific estimation rules.

## How to Override

- Pass `tokenizerModel` or inject custom `tokenCounter` when creating Session:

```ts
import { createTokenCounter, createAgentSession } from '@memo/core'

const tokenCounter = createTokenCounter('gpt-4o-mini')
const session = await createAgentSession({ tokenCounter }, { warnPromptTokens: 8_000 })
```

- A custom counter only needs `countText`, `countMessages`, and `dispose` methods.
