// CLI entry: interactive/one-off modes with session management and logs.
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { render } from 'ink'
import { App } from './App'
import { findLocalPackageInfoSync } from './version'
import { runMcpCommand } from './mcp'
import { createHttpAgentSession } from './http/http_agent_session'
import { parseSessionDetail, type ParsedHistoryLog } from './controllers/history_parser'
import { loadSessionHistoryEntries } from './controllers/session_history'
import { parseArgs, type ParsedArgs } from './cli_args'
import { routeCli } from './cli_router'
import { closeSharedCoreServerClient, withSharedCoreServerClient } from './http/shared_core_client'
import { runWebCommand } from './web/run_web_command'
import type { AgentSessionDeps, AgentSessionOptions, ChatMessage } from './http/api_types'

async function ensureProviderConfig(mode: 'plain' | 'tui') {
    const snapshot = await withSharedCoreServerClient((client) => client.getConfig())
    if (!snapshot.needsSetup) return snapshot

    const defaultProvider = snapshot.providers[0]
    const envCandidates = [
        defaultProvider?.env_api_key,
        'OPENAI_API_KEY',
        'DEEPSEEK_API_KEY',
    ].filter(Boolean) as string[]

    const hasEnvKey = envCandidates.some((key) => Boolean(process.env[key]))

    if (defaultProvider && hasEnvKey) {
        await withSharedCoreServerClient((client) =>
            client.patchConfig({
                current_provider: defaultProvider.name,
                providers: [defaultProvider],
            }),
        )
        const next = await withSharedCoreServerClient((client) => client.getConfig())
        console.log(
            `Detected API key in env. Wrote default provider (${defaultProvider.name}) to ${next.configPath}`,
        )
        return next
    }

    if (mode === 'tui') {
        return snapshot
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

        await withSharedCoreServerClient((client) =>
            client.patchConfig({
                current_provider: name,
                providers: [
                    {
                        name,
                        env_api_key: envKey,
                        model,
                        base_url: baseUrl || undefined,
                    },
                ],
            }),
        )
        const next = await withSharedCoreServerClient((client) => client.getConfig())
        console.log(`Config written to ${next.configPath}\n`)
        return next
    } finally {
        rl.close()
    }
}

async function loadPreviousSession(cwd: string): Promise<ParsedHistoryLog | null> {
    const entries = await loadSessionHistoryEntries({
        cwd,
        limit: 1,
    })
    const latest = entries[0]
    if (!latest) return null

    const detail = await withSharedCoreServerClient((client) => client.getSessionDetail(latest.id))
    return parseSessionDetail(detail)
}

async function restoreHistoryMessages(
    session: {
        history: ChatMessage[]
        restoreHistory?: (messages: ChatMessage[]) => Promise<void>
    },
    messages: ChatMessage[],
) {
    if (!messages.length) return
    if (typeof session.restoreHistory === 'function') {
        await session.restoreHistory(messages)
        return
    }
    const systemMessage = session.history[0]
    if (!systemMessage) return
    session.history.splice(0, session.history.length, systemMessage, ...messages)
}

async function runPlainMode(parsed: ParsedArgs) {
    const snapshot = await ensureProviderConfig('plain')
    const provider = snapshot.selectedProvider
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'interactive',
        contextWindow: provider.contextWindow,
        autoCompactThresholdPercent: snapshot.autoCompactThresholdPercent,
        activeMcpServers: snapshot.activeMcpServers,
        dangerous: parsed.options.dangerous,
    }
    const previousSession = parsed.options.prev ? await loadPreviousSession(process.cwd()) : null
    if (parsed.options.prev && !previousSession) {
        console.error('No previous session found for current directory.')
        process.exitCode = 1
        return
    }

    if (parsed.options.dangerous) {
        console.log('⚠️  DANGEROUS MODE: All tool approvals are bypassed!')
    }

    const deps: AgentSessionDeps = {
        requestApproval: parsed.options.dangerous
            ? undefined
            : (request) => {
                  console.log(`\n[approval required] ${request.toolName}: ${request.reason}`)
                  console.log('[approval] Run with --dangerous to bypass approval')
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
                // Don't show results, only show tool call parameters.
            },
        },
    }

    const session = await createHttpAgentSession(deps, {
        ...sessionOptions,
        providerName: provider.name,
        cwd: process.cwd(),
        toolPermissionMode: parsed.options.dangerous ? 'full' : 'once',
    })
    if (previousSession) {
        await restoreHistoryMessages(session, previousSession.messages)
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
    const snapshot = await ensureProviderConfig('tui')
    const provider = snapshot.selectedProvider
    const sessionId = randomUUID()
    const sessionOptions: AgentSessionOptions = {
        sessionId,
        mode: 'interactive',
        contextWindow: provider.contextWindow,
        autoCompactThresholdPercent: snapshot.autoCompactThresholdPercent,
        activeMcpServers: snapshot.activeMcpServers,
        dangerous: parsed.options.dangerous,
    }
    const previousSession = parsed.options.prev ? await loadPreviousSession(process.cwd()) : null
    if (parsed.options.prev && !previousSession) {
        console.error('No previous session found for current directory.')
        process.exitCode = 1
        return
    }

    if (parsed.options.dangerous) {
        console.log('⚠️  DANGEROUS MODE: All tool approvals are bypassed!')
        console.log('   Use with caution.\n')
    }

    const app = render(
        <App
            sessionOptions={sessionOptions}
            providerName={provider.name}
            model={provider.model}
            configPath={snapshot.configPath}
            mcpServers={snapshot.mcpServers}
            cwd={process.cwd()}
            providers={snapshot.providers}
            modelProfiles={snapshot.modelProfiles}
            dangerous={parsed.options.dangerous}
            needsSetup={snapshot.needsSetup}
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
    try {
        const argv = process.argv.slice(2)
        const route = routeCli(argv)
        if (route.kind === 'subcommand') {
            if (route.name === 'mcp') {
                await runMcpCommand(route.args)
                return
            }
            if (route.name === 'web') {
                await runWebCommand(route.args)
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
    } finally {
        await closeSharedCoreServerClient()
    }
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
