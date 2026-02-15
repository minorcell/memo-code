// CLI entry: interactive/one-off modes with session management and logs.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render } from 'ink'
import {
    createAgentSession,
    loadMemoConfig,
    resolveContextWindowForProvider,
    writeMemoConfig,
    selectProvider,
    getSessionsDir,
    type AgentSessionDeps,
    type AgentSessionOptions,
    type ChatMessage,
    type MemoConfig,
} from '@memo/core'
import { App } from './App'
import { findLocalPackageInfoSync } from './version'
import { runMcpCommand } from './mcp'
import { parseHistoryLog, type ParsedHistoryLog } from './controllers/history_parser'
import { loadSessionHistoryEntries } from './controllers/session_history'
import { parseArgs, type ParsedArgs } from './cli_args'
import { routeCli } from './cli_router'

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

async function loadPreviousSession(
    sessionsDir: string,
    cwd: string,
): Promise<ParsedHistoryLog | null> {
    const entries = await loadSessionHistoryEntries({
        sessionsDir,
        cwd,
        limit: 1,
    })
    const latest = entries[0]
    if (!latest) return null
    const raw = await readFile(latest.sessionFile, 'utf8')
    return parseHistoryLog(raw)
}

function restoreHistoryMessages(session: { history: ChatMessage[] }, messages: ChatMessage[]) {
    if (!messages.length) return
    const systemMessage = session.history[0]
    if (!systemMessage) return
    session.history.splice(0, session.history.length, systemMessage, ...messages)
}

async function runPlainMode(parsed: ParsedArgs) {
    const loaded = await ensureProviderConfig('plain')
    const provider = selectProvider(loaded.config)
    const contextWindow = resolveContextWindowForProvider(loaded.config, provider)
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'interactive',
        contextWindow,
        autoCompactThresholdPercent: loaded.config.auto_compact_threshold_percent,
        activeMcpServers: loaded.config.active_mcp_servers,
        generateSessionTitle: true,
        dangerous: parsed.options.dangerous,
    }
    const sessionsDir = getSessionsDir(loaded, sessionOptions)
    const previousSession = parsed.options.prev
        ? await loadPreviousSession(sessionsDir, process.cwd())
        : null
    if (parsed.options.prev && !previousSession) {
        console.error('No previous session found for current directory.')
        process.exitCode = 1
        return
    }

    // Show warning in dangerous mode
    if (parsed.options.dangerous) {
        console.log('⚠️  DANGEROUS MODE: All tool approvals are bypassed!')
    }

    const deps: AgentSessionDeps = {
        // In non-dangerous mode, plain mode does not support interactive approval, so don't set requestApproval
        // Returns error when tool needs approval
        requestApproval: parsed.options.dangerous
            ? undefined
            : (request) => {
                  // Plain mode cannot interact, deny directly
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
                // Don't show results, only show tool call parameters
            },
        },
    }

    const session = await createAgentSession(deps, sessionOptions)
    if (previousSession) {
        restoreHistoryMessages(session, previousSession.messages)
        console.log('[session] Continued from previous session context.')
    }

    let question = parsed.question
    if (!question && !process.stdin.isTTY) {
        question = await readStdin()
    }
    if (!question) {
        console.error('No input provided. Pass a question or use stdin.')
        await session.close()
        return
    }

    try {
        console.log(`User: ${question}\n`)
        const turnResult = await session.runTurn(question)
        console.log(`\n${turnResult.finalText}`)
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
    const contextWindow = resolveContextWindowForProvider(loaded.config, provider)
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'interactive',
        contextWindow,
        autoCompactThresholdPercent: loaded.config.auto_compact_threshold_percent,
        activeMcpServers: loaded.config.active_mcp_servers,
        generateSessionTitle: true,
        dangerous: parsed.options.dangerous,
    }
    const sessionsDir = getSessionsDir(loaded, sessionOptions)
    const previousSession = parsed.options.prev
        ? await loadPreviousSession(sessionsDir, process.cwd())
        : null
    if (parsed.options.prev && !previousSession) {
        console.error('No previous session found for current directory.')
        process.exitCode = 1
        return
    }

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
            modelProfiles={loaded.config.model_profiles}
            dangerous={parsed.options.dangerous}
            needsSetup={loaded.needsSetup}
            initialHistory={previousSession ?? undefined}
        />,
        {
            exitOnCtrlC: false,
            patchConsole: false,
        },
    )
    await app.waitUntilExit()
}

async function main() {
    const argv = process.argv.slice(2)
    const route = routeCli(argv)
    if (route.kind === 'subcommand') {
        if (route.name === 'mcp') {
            await runMcpCommand(route.args)
            return
        }
    }
    const parsed = parseArgs(route.args)
    if (parsed.options.showVersion) {
        const info = findLocalPackageInfoSync()
        const version = info?.version ?? 'unknown'
        console.log(version)
        return
    }
    const isInteractive = process.stdin.isTTY && process.stdout.isTTY
    if (parsed.options.once || !isInteractive) {
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
