// CLI entry: interactive/one-off modes with session management and logs.
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render } from 'ink'
import {
    createAgentSession,
    loadMemoConfig,
    writeMemoConfig,
    selectProvider,
    getSessionsDir,
    type AgentSessionDeps,
    type AgentSessionOptions,
    type MemoConfig,
} from '@memo/core'
import { App } from './tui/App'

type CliOptions = {
    once: boolean
    dangerous: boolean
}

type ParsedArgs = {
    question: string
    options: CliOptions
}

/** Minimal argv parsing, supports --once and --dangerous. */
function parseArgs(argv: string[]): ParsedArgs {
    const options: CliOptions = {
        once: false,
        dangerous: false,
    }
    const questionParts: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === undefined) {
            continue
        }
        if (arg === '--once') {
            options.once = true
            continue
        }
        if (arg === '--dangerous' || arg === '-d') {
            options.dangerous = true
            continue
        }
        questionParts.push(arg)
    }

    return { question: questionParts.join(' '), options }
}

async function ensureProviderConfig(mode: 'plain' | 'tui') {
    const loaded = await loadMemoConfig()
    if (!loaded.needsSetup) return loaded

    const defaultProvider = loaded.config.providers[0]
    const envCandidates = [
        defaultProvider?.env_api_key,
        'OPENAI_API_KEY',
        'DEEPSEEK_API_KEY',
    ].filter(Boolean) as string[]

    const hasEnvKey = envCandidates.some((key) => Boolean(process.env[key]))

    if (defaultProvider && hasEnvKey) {
        await writeMemoConfig(loaded.configPath, loaded.config)
        console.log(
            `Detected API key in env. Wrote default provider (${defaultProvider.name}) to ${loaded.configPath}`,
        )
        return { ...loaded, needsSetup: false }
    }

    if (mode === 'tui') {
        return loaded
    }

    const rl = createInterface({ input, output })
    const ask = async (prompt: string, fallback: string) => {
        const ans = (await rl.question(prompt)).trim()
        return ans || fallback
    }

    try {
        console.log('No provider config found. Please answer the prompts:')
        const name = await ask('Provider name [deepseek]: ', 'deepseek')
        const envKey = await ask('API key env var [DEEPSEEK_API_KEY]: ', 'DEEPSEEK_API_KEY')
        const model = await ask('Model name [deepseek-chat]: ', 'deepseek-chat')
        const baseUrl = await ask(
            'Base URL [https://api.deepseek.com]: ',
            'https://api.deepseek.com',
        )

        const config: MemoConfig = {
            current_provider: name,
            providers: [
                {
                    name,
                    env_api_key: envKey,
                    model,
                    base_url: baseUrl || undefined,
                },
            ],
        }
        await writeMemoConfig(loaded.configPath, config)
        console.log(`Config written to ${loaded.configPath}\n`)
        return { ...loaded, config, needsSetup: false }
    } finally {
        rl.close()
    }
}

async function runPlainMode(parsed: ParsedArgs) {
    const loaded = await ensureProviderConfig('plain')
    const provider = selectProvider(loaded.config)
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'once',
        stream: loaded.config.stream_output ?? false,
    }

    // 危险模式下显示警告
    if (parsed.options.dangerous) {
        console.log('⚠️  DANGEROUS MODE: All tool approvals are bypassed!')
    }

    const deps: AgentSessionDeps = {
        onAssistantStep: (text: string) => {
            process.stdout.write(text)
        },
        // 非危险模式下，plain 模式不支持交互式审批，所以不设置 requestApproval
        // 当工具需要审批时会返回错误
        requestApproval: parsed.options.dangerous
            ? undefined
            : (request) => {
                  // Plain 模式下无法交互，直接拒绝
                  console.log(`\n[approval required] ${request.toolName}: ${request.reason}`)
                  console.log(`[approval] Run with --dangerous to bypass approval`)
                  return Promise.resolve('deny')
              },
        hooks: {
            onAction: ({ action }) => {
                console.log(`\n[tool] ${action.tool}`)
                if (action.input !== undefined) {
                    console.log(`[input] ${JSON.stringify(action.input)}`)
                }
            },
            onObservation: () => {
                // 不显示结果，只显示工具调用参数
            },
        },
    }

    const session = await createAgentSession(deps, sessionOptions)

    let question = parsed.question
    if (!question && !process.stdin.isTTY) {
        question = await readStdin()
    }
    if (!question && parsed.options.once) {
        question = 'Give me a quick self-introduction.'
    }
    if (!question) {
        console.error('No input provided. Pass a question or use stdin.')
        await session.close()
        return
    }

    try {
        console.log(`User: ${question}\n`)
        const turnResult = await session.runTurn(question)
        if (!loaded.config.stream_output) {
            console.log(`\n${turnResult.finalText}`)
        }
        console.log(
            `\n[tokens] prompt=${turnResult.tokenUsage.prompt} completion=${turnResult.tokenUsage.completion} total=${turnResult.tokenUsage.total}`,
        )
        console.log(`\nprovider=${provider.name} model=${provider.model}`)
    } catch (err) {
        console.error(`Run failed: ${(err as Error).message}`)
    } finally {
        await session.close()
    }
}

async function runInteractiveTui(parsed: ParsedArgs) {
    const loaded = await ensureProviderConfig('tui')
    const provider = selectProvider(loaded.config)
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'interactive',
        stream: loaded.config.stream_output ?? false,
    }
    const sessionsDir = getSessionsDir(loaded, sessionOptions)

    // 危险模式下显示警告
    if (parsed.options.dangerous) {
        console.log('⚠️  DANGEROUS MODE: All tool approvals are bypassed!')
        console.log('   Use with caution.\n')
    }

    const app = render(
        <App
            sessionOptions={sessionOptions}
            providerName={provider.name}
            model={provider.model}
            configPath={loaded.configPath}
            mcpServers={loaded.config.mcp_servers ?? {}}
            cwd={process.cwd()}
            sessionsDir={sessionsDir}
            providers={loaded.config.providers}
            dangerous={parsed.options.dangerous}
            needsSetup={loaded.needsSetup}
        />,
        {
            exitOnCtrlC: false,
            patchConsole: false,
        },
    )
    await app.waitUntilExit()
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2))
    const isInteractive = process.stdin.isTTY && process.stdout.isTTY
    if (!isInteractive || parsed.options.once) {
        await runPlainMode(parsed)
        return
    }
    await runInteractiveTui(parsed)
}

void main()

async function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        let data = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => {
            data += chunk
        })
        process.stdin.on('end', () => {
            resolve(data.trim())
        })
        process.stdin.resume()
    })
}
