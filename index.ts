/**
 * Demo agent using DeepSeek with a simple ReAct-style XML loop.
 * Run with: DEEPSEEK_API_KEY=xxx bun run index.ts "你的问题"
 */
import { TOOLKIT, type ToolName } from "./tools"

type Role = "system" | "user" | "assistant"

type ChatMessage = {
    role: Role
    content: string
}

type ParsedAssistant = {
    action?: { tool: string; input: string }
    final?: string
}

const MAX_STEPS = 100

type DeepSeekMessage = { content?: string }
type DeepSeekChoice = { message?: DeepSeekMessage }
type DeepSeekResponse = { choices?: DeepSeekChoice[] }

async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
        throw new Error("缺少环境变量 DEEPSEEK_API_KEY")
    }

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages,
            temperature: 0.35,
        }),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`DeepSeek API 错误: ${res.status} ${text}`)
    }

    const data = (await res.json()) as DeepSeekResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== "string") {
        throw new Error("DeepSeek 返回内容为空")
    }
    return content
}

function parseAssistant(content: string): ParsedAssistant {
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

async function loadSystemPrompt() {
    try {
        return await Bun.file("prompt.tmpl").text()
    } catch (err) {
        throw new Error(`无法读取系统提示词 prompt.tmpl: ${(err as Error).message}`)
    }
}

async function runAgent(question: string) {
    const systemPrompt = await loadSystemPrompt()

    const history: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
    ]

    for (let step = 0; step < MAX_STEPS; step++) {
        const assistantText = await callDeepSeek(history)
        console.log(`\n[LLM 第 ${step + 1} 轮输出]\n${assistantText}\n`)
        history.push({ role: "assistant", content: assistantText })

        const parsed = parseAssistant(assistantText)
        if (parsed.final) {
            return parsed.final
        }

        if (parsed.action) {
            const toolFn = TOOLKIT[parsed.action.tool as ToolName]
            let observation: string

            if (toolFn) {
                observation = await toolFn(parsed.action.input)
            } else {
                observation = `未知工具: ${parsed.action.tool}`
            }

            history.push({
                role: "user",
                content: `<observation>${observation}</observation>`,
            })
            continue
        }

        break // 未产生 action 或 final
    }

    return "未能生成最终回答，请重试或调整问题。"
}

async function main() {
    const userQuestion = process.argv.slice(2).join(" ") || "给我做一个自我介绍"
    console.log(`用户问题: ${userQuestion}`)

    try {
        const answer = await runAgent(userQuestion)
        console.log("\n=== 最终回答 ===")
        console.log(answer)
    } catch (err) {
        console.error(`运行失败: ${(err as Error).message}`)
    }
}

await main()
