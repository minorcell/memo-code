// CLI 入口：提供交互式/一次性两种模式，负责 Session 管理与日志输出。
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { createAgentSession, type AgentSessionDeps, type AgentSessionOptions } from "@memo/core"

type CliOptions = {
    once: boolean
}

type ParsedArgs = {
    question: string
    options: CliOptions
}

/** 简易 argv 解析，仅支持 --once 开关。 */
function parseArgs(argv: string[]): ParsedArgs {
    const options: CliOptions = {
        once: false,
    }
    const questionParts: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === undefined) {
            continue
        }
        if (arg === "--once") {
            options.once = true
            continue
        }
        questionParts.push(arg)
    }

    return { question: questionParts.join(" "), options }
}

async function runInteractive(parsed: ParsedArgs) {
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: parsed.options.once ? "once" : "interactive",
    }

    const deps: AgentSessionDeps = {
        onAssistantStep: (text: string, step: number) => {
            console.log(`\n[LLM 第 ${step + 1} 轮输出]\n${text}\n`)
        },
        onObservation: (tool: string, observation: string, step: number) => {
            console.log(`\n[Observation 第 ${step + 1} 步 工具=${tool}]\n${observation}\n`)
        },
    }

    const session = await createAgentSession(deps, sessionOptions)
    console.log(`Session ${session.id} 已启动（模式: ${session.mode}）`)

    const rl = createInterface({ input, output })
    let nextQuestion = parsed.question
    if (parsed.options.once && !nextQuestion) {
        nextQuestion = "给我做一个自我介绍"
    }

    try {
        while (true) {
            const userInput = nextQuestion || (await rl.question("> "))
            nextQuestion = ""
            const trimmed = userInput.trim()
            if (!trimmed) {
                continue
            }
            if (trimmed === "/exit") {
                break
            }

            console.log(`\n用户: ${trimmed}`)
            const turnResult = await session.runTurn(trimmed)
            console.log("\n=== 最终回答 ===")
            console.log(turnResult.finalText)
            console.log(
                `\n[tokens] prompt=${turnResult.tokenUsage.prompt} completion=${turnResult.tokenUsage.completion} total=${turnResult.tokenUsage.total}`
            )

            if (parsed.options.once) {
                break
            }
        }
    } catch (err) {
        console.error(`运行失败: ${(err as Error).message}`)
    } finally {
        rl.close()
        await session.close()
    }
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2))
    await runInteractive(parsed)
}

await main()
