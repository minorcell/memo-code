// 工具方法：提示词读取、LLM 解析、历史记录
import type { ToolName } from "./tools/types"
export const HISTORY_FILE = "history.xml"

export type Role = "system" | "user" | "assistant"

export type ChatMessage = {
    role: Role
    content: string
}

export type AgentResult = {
    answer: string
    logEntries: string[]
}

export type ParsedAssistant = {
    action?: { tool: string; input: string }
    final?: string
}

export async function loadSystemPrompt() {
    try {
        return await Bun.file("src/prompt.tmpl").text()
    } catch (err) {
        throw new Error(
            `无法读取系统提示词 src/prompt.tmpl: ${(err as Error).message}`,
        )
    }
}

export function parseAssistant(content: string): ParsedAssistant {
    // 基于简单正则抽取 XML 片段；确保 action/final 都可被识别
    const actionMatch = content.match(
        /<action[^>]*tool="([^"]+)"[^>]*>([\s\S]*?)<\/action>/i,
    )
    const finalMatch = content.match(/<final>([\s\S]*?)<\/final>/i)

    const parsed: ParsedAssistant = {}
    if (actionMatch) {
        parsed.action = {
            tool: actionMatch[1] as ToolName,
            input: actionMatch[2]?.trim() ?? "",
        }
    }
    if (finalMatch) {
        parsed.final = finalMatch[1]?.trim()
    }

    return parsed
}

export async function writeHistory(logEntries: string[]) {
    const startedAt = new Date().toISOString()
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<history startedAt="${startedAt}">`,
        ...logEntries,
        "</history>",
        "",
    ].join("\n")
    await Bun.write(HISTORY_FILE, xml)
}

export function escapeCData(content: string) {
    return content.replaceAll("]]>", "]]]]><![CDATA[>")
}

export function wrapMessage(role: string, content: string) {
    // 使用 CDATA 包裹，避免模型输出中的特殊符号破坏 XML
    return `  <message role="${role}">\n    <![CDATA[\n${escapeCData(content)}\n    ]]>\n  </message>`
}
