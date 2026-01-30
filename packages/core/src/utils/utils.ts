/** @file Runtime 公用的解析辅助函数集合。 */
import type { ParsedAssistant } from '@memo/core/types'

/**
 * 从文本中提取所有 JSON 对象
 */
function extractJSONObjects(
    text: string,
): Array<{ json: string; start: number; end: number; obj: unknown }> {
    const results: Array<{ json: string; start: number; end: number; obj: unknown }> = []
    const seen = new Set<string>() // 去重

    // 匹配策略1: Markdown JSON 代码块 ```json ... ```
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*(?:```|$)/g
    let match: RegExpExecArray | null
    while ((match = codeBlockRegex.exec(text)) !== null) {
        const json = match[1] || ''
        if (!json || seen.has(json)) continue
        try {
            const obj = JSON.parse(json)
            results.push({ json, start: match.index, end: match.index + match[0].length, obj })
            seen.add(json)
        } catch {
            // ignore invalid JSON
        }
    }

    // 匹配策略2: 裸 JSON 对象（独立成行或被空格包围）
    // 使用更精确的正则，匹配完整的 JSON 对象
    const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    while ((match = jsonRegex.exec(text)) !== null) {
        const json = match[0]
        if (!json || seen.has(json)) continue
        // 确保这看起来像是个完整的对象
        if (!json.includes('"tool"') && !json.includes('"final"')) continue
        try {
            const obj = JSON.parse(json)
            results.push({ json, start: match.index, end: match.index + json.length, obj })
            seen.add(json)
        } catch {
            // ignore invalid JSON
        }
    }

    return results
}

/**
 * 检查对象是否是有效的 Action 结构
 */
function isValidAction(obj: unknown): obj is { tool: string; input?: unknown } {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        'tool' in obj &&
        typeof (obj as Record<string, unknown>).tool === 'string'
    )
}

/**
 * 检查对象是否是有效的 Final 结构（旧格式）
 */
function isValidFinal(obj: unknown): obj is { final: string } {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        'final' in obj &&
        typeof (obj as Record<string, unknown>).final === 'string'
    )
}

/**
 * 将模型输出解析为 Action 或 Final。
 * 策略（按优先级）：
 * 1. 寻找被 ```json ... ``` 包裹的 JSON 块
 * 2. 从混合文本中提取独立的 JSON 对象（兜底）
 * 3. 如果没找到，则将整个 content 视为 final
 *
 * 支持混合消息：思考文本 + 工具调用 JSON
 */
export function parseAssistant(content: string): ParsedAssistant {
    const parsed: ParsedAssistant = {}

    // 提取所有 JSON 对象
    const jsonObjects = extractJSONObjects(content)

    for (const { json, start, end, obj } of jsonObjects) {
        // 检查是否是 action
        if (isValidAction(obj)) {
            parsed.action = {
                tool: obj.tool.trim(),
                input: obj.input,
            }
            // 提取思考文本（去掉工具调用 JSON 后的内容）
            const before = content.slice(0, start).trim()
            const after = content.slice(end).trim()
            const thinkingParts: string[] = []
            if (before) thinkingParts.push(before)
            if (after) thinkingParts.push(after)
            if (thinkingParts.length > 0) {
                parsed.thinking = thinkingParts.join('\n')
            }
            return parsed
        }

        // 检查是否是旧格式 final
        if (isValidFinal(obj)) {
            parsed.final = obj.final
            return parsed
        }
    }

    // 尝试整个文本作为 JSON（兼容性处理）
    const trimmed = content.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const obj = JSON.parse(trimmed)
            if (isValidAction(obj)) {
                parsed.action = { tool: obj.tool, input: obj.input }
                return parsed
            }
            if (isValidFinal(obj)) {
                parsed.final = obj.final
                return parsed
            }
        } catch {
            // ignore
        }
    }

    // 默认：全部视为 final
    if (content.trim()) {
        parsed.final = content
    }

    return parsed
}
