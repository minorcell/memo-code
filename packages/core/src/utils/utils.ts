/** @file Runtime 公用的解析辅助函数集合。 */
import { jsonrepair } from 'jsonrepair'
import type { ParsedAssistant } from '@memo/core/types'

function tryParseJSON(text: string): unknown | null {
    try {
        return JSON.parse(text)
    } catch {
        try {
            const repaired = jsonrepair(text)
            return JSON.parse(repaired)
        } catch {
            return null
        }
    }
}

/**
 * 从文本中提取所有 JSON 对象
 * 支持脏JSON：包含换行符、注释等
 */
function extractJSONObjects(
    text: string,
): Array<{ json: string; start: number; end: number; obj: unknown }> {
    const results: Array<{ json: string; start: number; end: number; obj: unknown }> = []
    const seen = new Set<string>() // 去重

    // 匹配策略1: Markdown JSON 代码块 ```json ... ```
    // 使用深度匹配来支持嵌套的大括号
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g
    let match: RegExpExecArray | null
    while ((match = codeBlockRegex.exec(text)) !== null) {
        const content = match[1] || ''
        if (!content) continue
        // 从代码块内容中提取JSON对象
        const json = extractFirstJSONObject(content)
        if (!json || seen.has(json)) continue
        try {
            const obj = tryParseJSON(json)
            if (obj === null) continue
            results.push({ json, start: match.index, end: match.index + match[0].length, obj })
            seen.add(json)
        } catch {
            // ignore invalid JSON
        }
    }

    // 匹配策略2: 裸 JSON 对象（独立成行或被空格包围）
    // 使用栈来匹配嵌套的大括号
    const jsonMatches = findJSONObjects(text)
    for (const { json, start, end } of jsonMatches) {
        if (seen.has(json)) continue
        if (!json.includes('"tool"') && !json.includes('"final"')) continue
        try {
            const obj = tryParseJSON(json)
            if (obj === null) continue
            results.push({ json, start, end, obj })
            seen.add(json)
        } catch {
            // ignore invalid JSON
        }
    }

    return results
}

/**
 * 从文本中提取第一个完整的 JSON 对象
 */
function extractFirstJSONObject(text: string): string | null {
    const matches = findJSONObjects(text)
    return matches[0]?.json ?? null
}

/**
 * 使用栈算法查找所有 JSON 对象
 * 能正确处理嵌套的大括号
 */
function findJSONObjects(text: string): Array<{ json: string; start: number; end: number }> {
    const results: Array<{ json: string; start: number; end: number }> = []
    let braceCount = 0
    let start = -1
    let inString = false
    let escapeNext = false

    for (let i = 0; i < text.length; i++) {
        const char = text[i]

        if (escapeNext) {
            escapeNext = false
            continue
        }

        if (char === '\\' && inString) {
            escapeNext = true
            continue
        }

        if (char === '"' && !inString) {
            inString = true
        } else if (char === '"' && inString) {
            inString = false
        }

        if (inString) continue

        if (char === '{') {
            if (braceCount === 0) {
                start = i
            }
            braceCount++
        } else if (char === '}') {
            braceCount--
            if (braceCount === 0 && start !== -1) {
                const json = text.slice(start, i + 1)
                results.push({ json, start, end: i + 1 })
                start = -1
            }
        }
    }

    return results
}

/**
 * 提取/清理思考标签（<think> 或 <thinking>）内的文本。
 * 返回去除标签后的文本以及累积的思考内容。
 */
function extractThinkingText(raw: string): { thinkingParts: string[]; cleaned: string } {
    const thinkingParts: string[] = []
    const regex = /<\s*(think|thinking)\s*>([\s\S]*?)<\/\s*\1\s*>/gi
    const cleaned = raw.replace(regex, (_full, _tag, inner) => {
        const trimmed = (inner ?? '').trim()
        if (trimmed) thinkingParts.push(trimmed)
        return trimmed
    })
    return {
        thinkingParts,
        cleaned: cleaned.trim(),
    }
}

export function buildThinking(parts: string[]): string | undefined {
    if (parts.length === 0) return undefined
    const combined = parts.join('\n')
    const { thinkingParts, cleaned } = extractThinkingText(combined)
    if (thinkingParts.length > 0) {
        return thinkingParts.join('\n\n')
    }
    return cleaned || undefined
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
            const thinking = buildThinking(thinkingParts)
            if (thinking) parsed.thinking = thinking
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
        const obj = tryParseJSON(trimmed)
        if (obj && isValidAction(obj)) {
            parsed.action = { tool: obj.tool, input: obj.input }
            return parsed
        }
        if (obj && isValidFinal(obj)) {
            parsed.final = obj.final
            return parsed
        }
    }

    // 默认：全部视为 final
    if (content.trim()) {
        parsed.final = content
    }

    return parsed
}
