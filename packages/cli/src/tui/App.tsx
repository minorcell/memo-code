import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { Box, useApp, Text } from 'ink'
import {
    createAgentSession,
    loadMemoConfig,
    selectProvider,
    writeMemoConfig,
    type AgentSession,
    type AgentSessionDeps,
    type AgentSessionOptions,
    type ChatMessage,
    type ProviderConfig,
    type MCPServerConfig,
    type ApprovalRequest,
    type ApprovalDecision,
} from '@memo/core'
import type { InputHistoryEntry } from './suggestions'
import type { StepView, SystemMessage, TurnView } from './types'
import { TokenBar } from './components/layout/TokenBar'
import { MainContent } from './components/layout/MainContent'
import { InputPrompt } from './components/layout/InputPrompt'
import { ApprovalModal } from './components/modals/ApprovalModal'
import { inferToolStatus, formatTokenUsage, calculateContextPercent } from './utils'
import { resolveSlashCommand } from './commands'
import { checkForUpdate, findLocalPackageInfoSync } from './version'
import { SetupWizard } from './components/setup/SetupWizard'

const execAsync = promisify(exec)

export type AppProps = {
    sessionOptions: AgentSessionOptions
    providerName: string
    model: string
    configPath: string
    mcpServers: Record<string, MCPServerConfig>
    cwd: string
    sessionsDir: string
    providers: ProviderConfig[]
    dangerous?: boolean
    needsSetup?: boolean
}

function createEmptyTurn(index: number): TurnView {
    return { index, userInput: '', steps: [] }
}

export function App({
    sessionOptions,
    providerName,
    model,
    configPath,
    mcpServers,
    cwd,
    sessionsDir,
    providers,
    dangerous = false,
    needsSetup = false,
}: AppProps) {
    const { exit } = useApp()
    const [currentProvider, setCurrentProvider] = useState(providerName)
    const [currentModel, setCurrentModel] = useState(model)
    const [providersState, setProvidersState] = useState(providers)
    const [sessionOptionsState, setSessionOptionsState] = useState<AgentSessionOptions>({
        ...sessionOptions,
        providerName,
    })
    const [session, setSession] = useState<AgentSession | null>(null)
    const [turns, setTurns] = useState<TurnView[]>([])
    const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([])
    const [busy, setBusy] = useState(false)
    const currentTurnRef = useRef<number | null>(null)
    const [inputHistory, setInputHistory] = useState<string[]>([])
    const [sessionLogPath, setSessionLogPath] = useState<string | null>(null)
    const [historicalTurns, setHistoricalTurns] = useState<TurnView[]>([])
    const [pendingHistoryMessages, setPendingHistoryMessages] = useState<ChatMessage[] | null>(null)
    const sessionRef = useRef<AgentSession | null>(null)
    const [exitMessage, setExitMessage] = useState<string | null>(null)
    const sequenceRef = useRef(0)
    const [contextLimit, setContextLimit] = useState<number>(
        sessionOptions.maxPromptTokens ?? 120000,
    )
    const [setupPending, setSetupPending] = useState(needsSetup)
    // Track current session's actual context size (cumulative prompt tokens at turn start)
    const [currentContextTokens, setCurrentContextTokens] = useState<number>(0)
    const localPackageInfo = useMemo(() => findLocalPackageInfoSync(), [])

    // 审批系统状态
    const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
    const approvalResolverRef = useRef<((decision: ApprovalDecision) => void) | null>(null)

    const nextSequence = useCallback(() => {
        sequenceRef.current += 1
        return sequenceRef.current
    }, [])

    const appendSystemMessage = useCallback(
        (title: string, content: string) => {
            const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
            const sequence = nextSequence()
            setSystemMessages((prev) => [...prev, { id, title, content, sequence }])
        },
        [nextSequence],
    )

    const updateTurn = useCallback((turnIndex: number, updater: (turn: TurnView) => TurnView) => {
        setTurns((prev) => {
            const next = [...prev]
            let idx = next.findIndex((turn) => turn.index === turnIndex)
            if (idx === -1) {
                next.push(createEmptyTurn(turnIndex))
                idx = next.length - 1
            }
            const existing = next[idx]
            if (!existing) return next
            next[idx] = updater(existing)
            return next
        })
    }, [])

    const deps = useMemo<AgentSessionDeps>(
        () => ({
            onAssistantStep: (chunk: string, step: number) => {
                const turnIndex = currentTurnRef.current
                if (!turnIndex) return
                updateTurn(turnIndex, (turn) => {
                    const steps = turn.steps.slice()
                    while (steps.length <= step) {
                        steps.push({ index: steps.length, assistantText: '' })
                    }
                    const target = steps[step]
                    if (!target) return turn
                    const updated = {
                        ...target,
                        assistantText: target.assistantText + chunk,
                    }
                    steps[step] = updated
                    return { ...turn, steps }
                })
            },
            // 危险模式跳过审批
            requestApproval: dangerous
                ? undefined
                : (request: ApprovalRequest) => {
                      return new Promise((resolve) => {
                          setPendingApproval(request)
                          approvalResolverRef.current = resolve
                      })
                  },
            hooks: {
                onTurnStart: ({ turn, input, promptTokens }) => {
                    currentTurnRef.current = turn
                    // Update the cumulative context tokens for display
                    if (promptTokens && promptTokens > 0) {
                        setCurrentContextTokens(promptTokens)
                    }
                    updateTurn(turn, (existing) => ({
                        ...existing,
                        index: turn,
                        userInput: input,
                        steps: [],
                        startedAt: Date.now(),
                        contextPromptTokens: promptTokens ?? existing.contextPromptTokens,
                    }))
                },
                onAction: ({ turn, step, action, thinking, parallelActions }) => {
                    updateTurn(turn, (turnState) => {
                        const steps = turnState.steps.slice()
                        while (steps.length <= step) {
                            steps.push({ index: steps.length, assistantText: '' })
                        }
                        const target = steps[step]
                        if (!target) return turnState
                        steps[step] = {
                            ...target,
                            action,
                            thinking,
                            toolStatus: 'executing',
                            parallelActions:
                                parallelActions && parallelActions.length > 1
                                    ? parallelActions
                                    : undefined,
                        }
                        return { ...turnState, steps }
                    })
                },
                onObservation: ({ turn, step, observation }) => {
                    // 保存 observation 供状态判断与后续用途
                    updateTurn(turn, (turnState) => {
                        const steps = turnState.steps.slice()
                        while (steps.length <= step) {
                            steps.push({ index: steps.length, assistantText: '' })
                        }
                        const target = steps[step]
                        if (!target) return turnState
                        steps[step] = {
                            ...target,
                            observation,
                            toolStatus: inferToolStatus(observation),
                        }
                        return { ...turnState, steps }
                    })
                },
                onFinal: ({ turn, finalText, status, turnUsage, tokenUsage }) => {
                    updateTurn(turn, (turnState) => {
                        const startedAt = turnState.startedAt ?? Date.now()
                        const durationMs = Math.max(0, Date.now() - startedAt)
                        const promptTokens = tokenUsage?.prompt ?? turnState.contextPromptTokens
                        const sequence = turnState.sequence ?? nextSequence()
                        return {
                            ...turnState,
                            finalText,
                            status,
                            tokenUsage: turnUsage,
                            contextPromptTokens: promptTokens,
                            startedAt,
                            durationMs,
                            sequence,
                        }
                    })
                    setBusy(false)
                },
            },
        }),
        [updateTurn, dangerous, nextSequence],
    )

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            if (setupPending) return
            const prev = sessionRef.current
            if (prev) {
                await prev.close()
            }
            const created = await createAgentSession(deps, sessionOptionsState)
            if (cancelled) {
                await created.close()
                return
            }
            sessionRef.current = created
            setSession(created)
            setSessionLogPath(created.historyFilePath ?? null)
        })()
        return () => {
            cancelled = true
        }
    }, [deps, sessionOptionsState, setupPending])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const info = await checkForUpdate()
            if (cancelled || !info) return
            appendSystemMessage(
                'Update',
                `Update available: v${info.latest}. Run npm/pnpm/yarn/bun to update @memo-code/memo.`,
            )
        })()
        return () => {
            cancelled = true
        }
    }, [appendSystemMessage])

    useEffect(() => {
        return () => {
            if (sessionRef.current) {
                void sessionRef.current.close()
            }
        }
    }, [])

    const handleExit = useCallback(async () => {
        if (sessionRef.current) {
            await sessionRef.current.close()
        }
        setExitMessage('Bye!')
        // Give time for the message to render
        setTimeout(() => {
            exit()
        }, 300)
    }, [exit])

    const handleClear = useCallback(() => {
        setTurns([])
        setSystemMessages([])
        setHistoricalTurns([])
        setPendingHistoryMessages(null)
        setCurrentContextTokens(0) // Reset context tokens on clear
        sequenceRef.current = 0
    }, [])

    const handleNewSession = useCallback(async () => {
        // Clear UI state
        setTurns([])
        setSystemMessages([])
        setHistoricalTurns([])
        setPendingHistoryMessages(null)
        setCurrentContextTokens(0)
        sequenceRef.current = 0

        // Create new session
        const newSessionId = randomUUID()
        const newSessionOptions: AgentSessionOptions = {
            ...sessionOptionsState,
            sessionId: newSessionId,
        }

        // Close previous session
        if (sessionRef.current) {
            await sessionRef.current.close()
        }

        // Create new session
        const created = await createAgentSession(deps, newSessionOptions)
        sessionRef.current = created
        setSession(created)
        setSessionLogPath(created.historyFilePath ?? null)
        setSessionOptionsState(newSessionOptions)

        // Show system message
        appendSystemMessage('New Session', 'Started a new session with fresh context.')
    }, [deps, sessionOptionsState, appendSystemMessage])

    const handleHistorySelect = useCallback(
        async (entry: InputHistoryEntry) => {
            if (!entry.sessionFile) {
                appendSystemMessage('History', 'This entry has no context file to load.')
                return
            }
            try {
                const raw = await readFile(entry.sessionFile, 'utf8')
                const parsed = parseHistoryLog(raw)
                setHistoricalTurns(parsed.turns)
                setPendingHistoryMessages(parsed.messages)
                setBusy(false)
                setTurns([])
                setSession(null)
                setSessionLogPath(null)
                setCurrentContextTokens(0) // Reset context tokens when loading history
                currentTurnRef.current = null
                sequenceRef.current = Math.max(sequenceRef.current, parsed.maxSequence)
                // 重新拉起 session，避免旧上下文残留/计数错位
                setSessionOptionsState((prev) => ({ ...prev, sessionId: randomUUID() }))
                appendSystemMessage('History loaded', parsed.summary || entry.input)
            } catch (err) {
                appendSystemMessage(
                    'Failed to load history',
                    `Unable to read ${entry.sessionFile}: ${(err as Error).message}`,
                )
            }
        },
        [appendSystemMessage],
    )

    const persistCurrentProvider = useCallback(
        async (name: string) => {
            try {
                const loaded = await loadMemoConfig()
                const nextConfig = { ...loaded.config, current_provider: name }
                await writeMemoConfig(loaded.configPath, nextConfig)
            } catch (err) {
                appendSystemMessage(
                    'Failed to save config',
                    `Failed to save model selection: ${(err as Error).message}`,
                )
            }
        },
        [appendSystemMessage],
    )

    const handleCancelRun = useCallback(() => {
        if (!busy) return
        session?.cancelCurrentTurn?.()
    }, [busy, session])

    const handleModelSelect = useCallback(
        async (provider: ProviderConfig) => {
            if (provider.name === currentProvider && provider.model === currentModel) {
                appendSystemMessage(
                    'Model switch',
                    `Already using ${provider.name} (${provider.model})`,
                )
                return
            }
            if (busy) {
                appendSystemMessage(
                    'Model switch',
                    'Currently running. Press Esc Esc to cancel before switching models.',
                )
                return
            }
            setTurns([])
            setHistoricalTurns([])
            setPendingHistoryMessages(null)
            setCurrentContextTokens(0) // Reset context tokens on model switch
            currentTurnRef.current = null
            setSession(null)
            setSessionLogPath(null)
            setCurrentProvider(provider.name)
            setCurrentModel(provider.model)
            setSessionOptionsState((prev) => ({
                ...prev,
                sessionId: randomUUID(),
                providerName: provider.name,
            }))
            await persistCurrentProvider(provider.name)
            appendSystemMessage('Model switch', `Switched to ${provider.name} (${provider.model})`)
        },
        [appendSystemMessage, busy, currentModel, currentProvider, persistCurrentProvider],
    )

    const runShellCommand = useCallback(
        async (command: string) => {
            if (!command.trim()) {
                appendSystemMessage('Shell Command', 'Usage: $ <command> (e.g. $ git status)')
                return
            }
            setBusy(true)
            try {
                const { stdout, stderr } = await execAsync(command, {
                    cwd,
                    maxBuffer: 5 * 1024 * 1024, // prevent truncation on large outputs
                })
                const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n')
                appendSystemMessage('Shell Result', output || '(no output)')
            } catch (err) {
                const error = err as Error & { stdout?: string; stderr?: string }
                const parts = [error.stdout?.trim(), error.stderr?.trim(), error.message]
                const message = parts.filter(Boolean).join('\n')
                appendSystemMessage('Shell Error', message || 'Command failed')
            } finally {
                setBusy(false)
            }
        },
        [appendSystemMessage, cwd],
    )

    const handleCommand = useCallback(
        async (raw: string) => {
            const result = resolveSlashCommand(raw, {
                configPath,
                providerName: currentProvider,
                model: currentModel,
                mcpServers,
                providers: providersState,
                contextLimit,
            })
            if (result.kind === 'exit') {
                await handleExit()
                return
            }
            if (result.kind === 'new') {
                await handleNewSession()
                return
            }
            if (result.kind === 'switch_model') {
                await handleModelSelect(result.provider)
                return
            }
            if (result.kind === 'set_context_limit') {
                setContextLimit(result.limit)
                appendSystemMessage(
                    'Context length',
                    `Context limit set to ${(result.limit / 1000).toFixed(0)}k tokens`,
                )
                return
            }
            if (result.kind === 'init_agents_md') {
                appendSystemMessage(
                    'Init',
                    'Analyzing project structure and generating AGENTS.md...',
                )
                // Trigger the agent to generate AGENTS.md
                const initPrompt = `Please analyze the current project and create an AGENTS.md file at the project root.

The AGENTS.md should include:
1. Project name and brief description
2. Directory structure overview
3. Key technologies and stack
4. Coding conventions and style guidelines
5. Build/test/development commands
6. Any project-specific notes for AI assistants

Steps:
1. First explore the project structure using glob and bash tools
2. Read key configuration files (package.json, tsconfig.json, etc.)
3. Understand the tech stack and conventions
4. Create the AGENTS.md file using the write tool

Make the AGENTS.md concise but informative, following best practices for AI agent guidelines.`
                setInputHistory((prev) => [...prev, '/init'])
                if (!session) {
                    appendSystemMessage('Error', 'Session not initialized')
                    return
                }
                setBusy(true)
                try {
                    await session.runTurn(initPrompt)
                } catch (err) {
                    setBusy(false)
                }
                return
            }
            if (result.kind === 'shell_command') {
                await runShellCommand(result.command)
                return
            }
            appendSystemMessage(result.title, result.content)
        },
        [
            appendSystemMessage,
            configPath,
            handleClear,
            handleExit,
            handleModelSelect,
            mcpServers,
            currentModel,
            currentProvider,
            contextLimit,
            providersState,
            runShellCommand,
        ],
    )

    const handleSetupComplete = useCallback(async () => {
        try {
            const loaded = await loadMemoConfig()
            const provider = selectProvider(loaded.config)
            setProvidersState(loaded.config.providers)
            setCurrentProvider(provider.name)
            setCurrentModel(provider.model)
            setSessionOptionsState((prev) => ({
                ...prev,
                sessionId: randomUUID(),
                providerName: provider.name,
            }))
            setSetupPending(false)
            appendSystemMessage('Setup', `Config saved to ${loaded.configPath}`)
        } catch (err) {
            appendSystemMessage('Setup', `Failed to reload config: ${(err as Error).message}`)
        }
    }, [appendSystemMessage])

    useEffect(() => {
        if (!session || !pendingHistoryMessages?.length) return
        // 用历史对话覆盖当前 session 的用户上下文，保留系统提示词。
        const systemMessage = session.history[0]
        if (!systemMessage) return
        session.history.splice(0, session.history.length, systemMessage, ...pendingHistoryMessages)
        setPendingHistoryMessages(null)
    }, [pendingHistoryMessages, session])

    const handleSubmit = useCallback(
        async (value: string) => {
            // Support plain "exit" in addition to "/exit"
            if (value.trim().toLowerCase() === 'exit') {
                await handleExit()
                return
            }

            if (!session || busy) return
            const trimmed = value.trim()
            if (trimmed.startsWith('$')) {
                const command = trimmed.slice(1).trim()
                setInputHistory((prev) => [...prev, value])
                await runShellCommand(command)
                return
            }
            if (value.startsWith('/')) {
                await handleCommand(value)
                return
            }
            setInputHistory((prev) => [...prev, value])
            setBusy(true)
            try {
                await session.runTurn(value)
            } catch (err) {
                setBusy(false)
            }
        },
        [busy, handleCommand, handleExit, session],
    )

    const lastTurn = turns[turns.length - 1]
    const tokenLine = formatTokenUsage(lastTurn?.tokenUsage)
    // Use cumulative context tokens (updated on each turn start) for accurate context usage display
    const contextPercent = calculateContextPercent(currentContextTokens, contextLimit)
    const displayTurns = useMemo(() => [...historicalTurns, ...turns], [historicalTurns, turns])

    // 处理审批决策
    const handleApprovalDecision = useCallback((decision: ApprovalDecision) => {
        const resolver = approvalResolverRef.current
        if (resolver) {
            resolver(decision)
            approvalResolverRef.current = null
        }
        setPendingApproval(null)
    }, [])

    // Show exit message
    if (exitMessage) {
        const lines = exitMessage.split('\n')
        return (
            <Box flexDirection="column">
                {lines.map((line, index) => (
                    <Text key={index} color="green">
                        {line}
                    </Text>
                ))}
            </Box>
        )
    }

    if (setupPending) {
        return (
            <SetupWizard
                configPath={configPath}
                onComplete={handleSetupComplete}
                onExit={handleExit}
            />
        )
    }

    return (
        <Box flexDirection="column">
            <MainContent
                systemMessages={systemMessages}
                turns={displayTurns}
                headerInfo={{
                    providerName: currentProvider,
                    model: currentModel,
                    cwd,
                    sessionId: sessionOptionsState.sessionId ?? 'unknown',
                    mcpNames: Object.keys(mcpServers ?? {}).sort(),
                    version: localPackageInfo?.version ?? 'unknown',
                }}
            />
            <InputPrompt
                disabled={!session || busy || !!pendingApproval}
                onSubmit={handleSubmit}
                onExit={handleExit}
                onClear={handleClear}
                onNewSession={handleNewSession}
                onCancelRun={handleCancelRun}
                onHistorySelect={handleHistorySelect}
                onModelSelect={handleModelSelect}
                onSystemMessage={appendSystemMessage}
                onSetContextLimit={(limit) => {
                    setContextLimit(limit)
                    appendSystemMessage(
                        'Context length',
                        `Context limit set to ${(limit / 1000).toFixed(0)}k tokens`,
                    )
                }}
                history={inputHistory}
                cwd={cwd}
                sessionsDir={sessionsDir}
                currentSessionFile={sessionLogPath ?? undefined}
                providers={providersState}
                configPath={configPath}
                providerName={currentProvider}
                model={currentModel}
                contextLimit={contextLimit}
                mcpServers={mcpServers}
            />
            {/* 审批对话框显示在输入框下方 */}
            {pendingApproval && (
                <ApprovalModal request={pendingApproval} onDecision={handleApprovalDecision} />
            )}
            <TokenBar contextPercent={contextPercent} />
        </Box>
    )
}

function parseHistoryLog(raw: string): {
    summary: string
    messages: ChatMessage[]
    turns: TurnView[]
    maxSequence: number
} {
    const messages: ChatMessage[] = []
    const turns: TurnView[] = []
    const summaryParts: string[] = []
    const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    let currentTurn: TurnView | null = null
    let turnCount = 0
    let sequence = 0

    for (const line of lines) {
        let event: any
        try {
            event = JSON.parse(line)
        } catch {
            continue
        }
        if (!event || typeof event !== 'object') continue
        if (event.type === 'turn_start') {
            const userInput = typeof event.content === 'string' ? event.content : ''
            const index = -(turnCount + 1)
            currentTurn = {
                index,
                userInput,
                steps: [],
                status: 'ok',
                sequence: (sequence += 1),
            }
            turns.push(currentTurn)
            if (userInput) {
                messages.push({ role: 'user', content: userInput })
                summaryParts.push(`User: ${userInput}`)
            }
            turnCount += 1
            continue
        }
        if (event.type === 'assistant') {
            const assistantText = typeof event.content === 'string' ? event.content : ''
            if (assistantText) {
                messages.push({ role: 'assistant', content: assistantText })
                summaryParts.push(`Assistant: ${assistantText}`)
                if (currentTurn) {
                    const step: StepView = {
                        index: currentTurn.steps.length,
                        assistantText,
                    }
                    currentTurn.steps = [...currentTurn.steps, step]
                    currentTurn.finalText = assistantText
                }
            }
            continue
        }
        if (event.type === 'action' && currentTurn) {
            const meta = event.meta
            if (meta && typeof meta === 'object') {
                const tool = typeof meta.tool === 'string' ? meta.tool : ''
                const input = meta.input
                const thinking = typeof meta.thinking === 'string' ? meta.thinking : ''
                const toolBlocks = Array.isArray((meta as any).toolBlocks)
                    ? ((meta as any).toolBlocks as Array<{ name?: unknown; input?: unknown }>)
                    : []
                const parallelActions = toolBlocks
                    .map((block) => {
                        const name = typeof block?.name === 'string' ? block.name : ''
                        if (!name) return null
                        return { tool: name, input: block?.input }
                    })
                    .filter(Boolean) as Array<{ tool: string; input: unknown }>
                const lastStep = currentTurn.steps[currentTurn.steps.length - 1]
                if (lastStep) {
                    if (parallelActions.length > 1) {
                        lastStep.action = parallelActions[0]
                        lastStep.parallelActions = parallelActions
                    } else if (tool) {
                        lastStep.action = { tool, input }
                    }
                    if (thinking) {
                        lastStep.thinking = thinking
                    }
                }
            }
            continue
        }
        if (event.type === 'observation' && currentTurn) {
            const content = typeof event.content === 'string' ? event.content : ''
            const lastStep = currentTurn.steps[currentTurn.steps.length - 1]
            if (lastStep) {
                lastStep.observation = content
            }
            continue
        }
    }

    return {
        summary: summaryParts.join('\n'),
        messages,
        turns,
        maxSequence: sequence,
    }
}
