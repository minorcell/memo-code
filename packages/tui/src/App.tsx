import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Box, Text, useApp } from 'ink'
import {
    createAgentSession,
    loadMemoConfig,
    selectProvider,
    writeMemoConfig,
    type AgentSession,
    type AgentSessionDeps,
    type AgentSessionOptions,
    type ChatMessage,
    type MCPServerConfig,
    type ProviderConfig,
} from '@memo/core'
import type { ApprovalDecision, ApprovalRequest } from '@memo/tools/approval'
import { ChatWidget } from './chatwidget/ChatWidget'
import { Composer } from './bottom_pane/Composer'
import { Footer } from './bottom_pane/Footer'
import { ApprovalOverlay } from './overlays/ApprovalOverlay'
import { McpActivationOverlay } from './overlays/McpActivationOverlay'
import { notifyApprovalRequested } from './notifications/approval_notification'
import { SetupWizard } from './setup/SetupWizard'
import { parseHistoryLog } from './controllers/history_parser'
import {
    chatTimelineReducer,
    createInitialTimelineState,
    type ChatTimelineAction,
} from './state/chat_timeline'
import {
    calculateContextPercent,
    formatTokenUsage,
    inferParallelToolStatuses,
    inferToolStatus,
} from './utils'
import { checkForUpdate, findLocalPackageInfoSync } from './version'
import type { SessionHistoryEntry } from './controllers/session_history'
import {
    DEFAULT_CONTEXT_LIMIT,
    formatSlashCommand,
    PLAIN_EXIT_COMMAND,
    SLASH_COMMANDS,
    TOOL_PERMISSION_MODES,
    type ToolPermissionMode,
} from './constants'

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

function normalizeActiveMcpServers(
    availableNames: string[],
    configuredActiveNames: string[] | undefined,
): string[] {
    if (availableNames.length === 0) return []
    if (configuredActiveNames === undefined) {
        return [...availableNames]
    }
    if (configuredActiveNames.length === 0) {
        return []
    }

    const available = new Set(availableNames)
    const normalized = configuredActiveNames.filter((name) => available.has(name))
    return normalized.length > 0 ? normalized : [...availableNames]
}

function normalizeMcpSelection(availableNames: string[], selectedNames: string[]): string[] {
    if (availableNames.length === 0) return []
    if (selectedNames.length === 0) return []
    const available = new Set(availableNames)
    return selectedNames.filter((name) => available.has(name))
}

function clearTerminalScreen() {
    try {
        if (process.stdout?.isTTY) {
            process.stdout.write('\x1Bc')
        }
    } catch {
        // Best-effort terminal clear.
    }
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
    const availableMcpServerNames = useMemo(
        () => Object.keys(mcpServers ?? {}).sort(),
        [mcpServers],
    )
    const initialActiveMcpServers = useMemo(
        () => normalizeActiveMcpServers(availableMcpServerNames, sessionOptions.activeMcpServers),
        [availableMcpServerNames, sessionOptions.activeMcpServers],
    )
    const defaultToolPermissionMode: ToolPermissionMode =
        sessionOptions.toolPermissionMode ??
        (dangerous ? TOOL_PERMISSION_MODES.FULL : TOOL_PERMISSION_MODES.ONCE)

    const [timeline, dispatchTimeline] = useReducer(
        chatTimelineReducer,
        undefined,
        createInitialTimelineState,
    )

    const [currentProvider, setCurrentProvider] = useState(providerName)
    const [currentModel, setCurrentModel] = useState(model)
    const [providersState, setProvidersState] = useState(providers)
    const [toolPermissionMode, setToolPermissionMode] =
        useState<ToolPermissionMode>(defaultToolPermissionMode)

    const [sessionOptionsState, setSessionOptionsState] = useState<AgentSessionOptions>({
        ...sessionOptions,
        providerName,
        dangerous: defaultToolPermissionMode === TOOL_PERMISSION_MODES.FULL,
        toolPermissionMode: defaultToolPermissionMode,
    })

    const [busy, setBusy] = useState(false)
    const [inputHistory, setInputHistory] = useState<string[]>([])
    const [sessionLogPath, setSessionLogPath] = useState<string | null>(null)
    const [pendingHistoryMessages, setPendingHistoryMessages] = useState<ChatMessage[] | null>(null)

    const [contextLimit, setContextLimit] = useState<number>(
        sessionOptions.maxPromptTokens ?? DEFAULT_CONTEXT_LIMIT,
    )
    const [currentContextTokens, setCurrentContextTokens] = useState(0)

    const [setupPending, setSetupPending] = useState(needsSetup)
    const [mcpSelectionPending, setMcpSelectionPending] = useState(
        !needsSetup && availableMcpServerNames.length > 0,
    )
    const [activeMcpServerNames, setActiveMcpServerNames] =
        useState<string[]>(initialActiveMcpServers)
    const [exitMessage, setExitMessage] = useState<string | null>(null)

    const [session, setSession] = useState<AgentSession | null>(null)
    const sessionRef = useRef<AgentSession | null>(null)

    const currentTurnRef = useRef<number | null>(null)
    const nextUserInputOverrideRef = useRef<string | null>(null)

    const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
    const approvalResolverRef = useRef<((decision: ApprovalDecision) => void) | null>(null)

    const localPackageInfo = useMemo(() => findLocalPackageInfoSync(), [])

    const dispatch = useCallback((action: ChatTimelineAction) => {
        dispatchTimeline(action)
    }, [])

    useEffect(() => {
        if (setupPending) return
        setActiveMcpServerNames(initialActiveMcpServers)
        setMcpSelectionPending(availableMcpServerNames.length > 0)
    }, [setupPending, initialActiveMcpServers, availableMcpServerNames.length])

    const appendSystemMessage = useCallback(
        (title: string, content: string, tone: 'info' | 'warning' | 'error' = 'info') => {
            dispatch({ type: 'append_system_message', title, content, tone })
        },
        [dispatch],
    )

    const deps = useMemo<AgentSessionDeps>(
        () => ({
            onAssistantStep: (chunk: string, step: number) => {
                const turn = currentTurnRef.current
                if (!turn) return
                dispatch({ type: 'assistant_chunk', turn, step, chunk })
            },
            requestApproval:
                toolPermissionMode === TOOL_PERMISSION_MODES.FULL ||
                toolPermissionMode === TOOL_PERMISSION_MODES.NONE
                    ? undefined
                    : (request: ApprovalRequest) =>
                          new Promise((resolve) => {
                              void notifyApprovalRequested(request)
                              setPendingApproval(request)
                              approvalResolverRef.current = resolve
                          }),
            hooks: {
                onTurnStart: ({ turn, input, promptTokens }) => {
                    currentTurnRef.current = turn
                    const override = nextUserInputOverrideRef.current
                    if (override) {
                        nextUserInputOverrideRef.current = null
                    }
                    const displayInput = override ?? input

                    if (promptTokens && promptTokens > 0) {
                        setCurrentContextTokens(promptTokens)
                    }

                    dispatch({
                        type: 'turn_start',
                        turn,
                        input: displayInput,
                        promptTokens,
                    })
                },
                onAction: ({ turn, step, action, thinking, parallelActions }) => {
                    dispatch({
                        type: 'tool_action',
                        turn,
                        step,
                        action,
                        thinking,
                        parallelActions,
                    })
                },
                onObservation: ({
                    turn,
                    step,
                    observation,
                    resultStatus,
                    parallelResultStatuses,
                }) => {
                    dispatch({
                        type: 'tool_observation',
                        turn,
                        step,
                        observation,
                        toolStatus: inferToolStatus(resultStatus),
                        parallelToolStatuses: inferParallelToolStatuses(parallelResultStatuses),
                    })
                },
                onFinal: ({ turn, finalText, status, errorMessage, turnUsage, tokenUsage }) => {
                    dispatch({
                        type: 'turn_final',
                        turn,
                        finalText,
                        status,
                        errorMessage,
                        turnUsage,
                        tokenUsage,
                    })
                    setBusy(false)
                },
            },
        }),
        [dispatch, toolPermissionMode],
    )

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            if (setupPending || mcpSelectionPending) return

            try {
                const previous = sessionRef.current
                if (previous) {
                    await previous.close()
                }

                const created = await createAgentSession(deps, sessionOptionsState)
                if (cancelled) {
                    await created.close()
                    return
                }

                sessionRef.current = created
                setSession(created)
                setSessionLogPath(created.historyFilePath ?? null)
            } catch (err) {
                if (cancelled) return
                sessionRef.current = null
                setSession(null)
                setSessionLogPath(null)
                setBusy(false)
                appendSystemMessage(
                    'Session',
                    `Failed to create session: ${(err as Error).message}`,
                    'error',
                )
            }
        })()

        return () => {
            cancelled = true
        }
    }, [appendSystemMessage, deps, mcpSelectionPending, sessionOptionsState, setupPending])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const update = await checkForUpdate()
            if (cancelled || !update) return
            appendSystemMessage(
                'Update',
                `Update available: v${update.latest}. Run: npm install -g @memo-code/memo@latest`,
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
        const resolver = approvalResolverRef.current
        if (resolver) {
            resolver('deny')
            approvalResolverRef.current = null
        }
        if (pendingApproval) {
            setPendingApproval(null)
        }
        if (sessionRef.current) {
            await sessionRef.current.close()
        }
        setExitMessage('Bye!')
        setTimeout(() => exit(), 250)
    }, [exit, pendingApproval])

    const handleClear = useCallback(() => {
        if (busy) {
            appendSystemMessage('Clear', 'Cancel current run before clearing timeline.', 'warning')
            return
        }
        if (pendingApproval) {
            appendSystemMessage(
                'Clear',
                'Resolve current approval request before clearing timeline.',
                'warning',
            )
            return
        }
        dispatch({ type: 'clear_current_timeline' })
        setPendingHistoryMessages(null)
        setCurrentContextTokens(0)
        clearTerminalScreen()
    }, [appendSystemMessage, busy, dispatch, pendingApproval])

    const handleNewSession = useCallback(() => {
        if (busy) {
            appendSystemMessage(
                'New Session',
                'Cancel current run before starting a new session.',
                'warning',
            )
            return
        }
        if (pendingApproval) {
            appendSystemMessage(
                'New Session',
                'Resolve current approval request before starting a new session.',
                'warning',
            )
            return
        }
        dispatch({ type: 'reset_all' })
        setPendingHistoryMessages(null)
        setCurrentContextTokens(0)
        currentTurnRef.current = null
        setSessionOptionsState((prev) => ({
            ...prev,
            sessionId: randomUUID(),
        }))
        appendSystemMessage('New Session', 'Started a fresh session.')
    }, [appendSystemMessage, busy, dispatch, pendingApproval])

    const persistCurrentProvider = useCallback(
        async (name: string) => {
            try {
                const loaded = await loadMemoConfig()
                await writeMemoConfig(loaded.configPath, {
                    ...loaded.config,
                    current_provider: name,
                })
            } catch (err) {
                appendSystemMessage(
                    'Config',
                    `Failed to persist provider: ${(err as Error).message}`,
                    'warning',
                )
            }
        },
        [appendSystemMessage],
    )

    const handleModelSelect = useCallback(
        async (provider: ProviderConfig) => {
            if (busy) {
                appendSystemMessage(
                    'Model switch',
                    'Cancel current run before switching models.',
                    'warning',
                )
                return
            }

            if (provider.name === currentProvider && provider.model === currentModel) {
                appendSystemMessage(
                    'Model switch',
                    `Already using ${provider.name} (${provider.model}).`,
                )
                return
            }

            dispatch({ type: 'reset_all' })
            setCurrentContextTokens(0)
            currentTurnRef.current = null

            setCurrentProvider(provider.name)
            setCurrentModel(provider.model)
            setSessionOptionsState((prev) => ({
                ...prev,
                sessionId: randomUUID(),
                providerName: provider.name,
            }))

            await persistCurrentProvider(provider.name)
            appendSystemMessage('Model switch', `Switched to ${provider.name} (${provider.model}).`)
        },
        [
            appendSystemMessage,
            busy,
            currentModel,
            currentProvider,
            dispatch,
            persistCurrentProvider,
        ],
    )

    const persistContextLimit = useCallback(
        async (limit: number) => {
            try {
                const loaded = await loadMemoConfig()
                await writeMemoConfig(loaded.configPath, {
                    ...loaded.config,
                    max_prompt_tokens: limit,
                })
            } catch (err) {
                appendSystemMessage(
                    'Context',
                    `Failed to persist context limit: ${(err as Error).message}`,
                    'warning',
                )
            }
        },
        [appendSystemMessage],
    )

    const handleSetContextLimit = useCallback(
        (limit: number) => {
            if (busy) {
                appendSystemMessage(
                    'Context',
                    'Cancel current run before changing context window.',
                    'warning',
                )
                return
            }
            if (pendingApproval) {
                appendSystemMessage(
                    'Context',
                    'Resolve current approval request before changing context window.',
                    'warning',
                )
                return
            }
            setContextLimit(limit)
            setCurrentContextTokens(0)
            setSessionOptionsState((prev) => ({
                ...prev,
                maxPromptTokens: limit,
                sessionId: randomUUID(),
            }))
            appendSystemMessage('Context', `Context window set to ${Math.floor(limit / 1000)}k.`)
            void persistContextLimit(limit)
        },
        [appendSystemMessage, busy, pendingApproval, persistContextLimit],
    )

    const toolPermissionLabel = useCallback((mode: ToolPermissionMode): string => {
        if (mode === TOOL_PERMISSION_MODES.NONE) return 'none (no tools)'
        if (mode === TOOL_PERMISSION_MODES.ONCE) return 'once (approval required)'
        return 'full (no approval)'
    }, [])

    const handleSetToolPermission = useCallback(
        (mode: ToolPermissionMode) => {
            if (busy) {
                appendSystemMessage(
                    'Tools',
                    'Cancel current run before changing tool permission mode.',
                    'warning',
                )
                return
            }

            if (pendingApproval) {
                appendSystemMessage(
                    'Tools',
                    'Resolve current approval request before changing tool permission mode.',
                    'warning',
                )
                return
            }

            if (mode === toolPermissionMode) {
                appendSystemMessage('Tools', `Already using ${toolPermissionLabel(mode)}.`)
                return
            }

            setToolPermissionMode(mode)
            setSessionOptionsState((prev) => ({
                ...prev,
                sessionId: randomUUID(),
                dangerous: mode === TOOL_PERMISSION_MODES.FULL,
                toolPermissionMode: mode,
            }))
            appendSystemMessage('Tools', `Tool permission set to ${toolPermissionLabel(mode)}.`)
        },
        [appendSystemMessage, busy, pendingApproval, toolPermissionLabel, toolPermissionMode],
    )

    const persistActiveMcpServers = useCallback(
        async (names: string[]) => {
            try {
                const loaded = await loadMemoConfig()
                await writeMemoConfig(loaded.configPath, {
                    ...loaded.config,
                    active_mcp_servers: names,
                })
            } catch (err) {
                appendSystemMessage(
                    'MCP',
                    `Failed to persist active MCP servers: ${(err as Error).message}`,
                    'warning',
                )
            }
        },
        [appendSystemMessage],
    )

    const handleConfirmMcpActivation = useCallback(
        (selectedNames: string[], persistSelection: boolean) => {
            const normalized = normalizeMcpSelection(availableMcpServerNames, selectedNames)
            setActiveMcpServerNames(normalized)
            setMcpSelectionPending(false)
            setSessionOptionsState((prev) => ({
                ...prev,
                sessionId: randomUUID(),
                activeMcpServers: normalized,
            }))

            if (persistSelection) {
                void persistActiveMcpServers(normalized)
            }
        },
        [availableMcpServerNames, persistActiveMcpServers],
    )

    const handleHistorySelect = useCallback(
        async (entry: SessionHistoryEntry) => {
            if (busy) {
                appendSystemMessage(
                    'History',
                    'Cancel current run before loading session history.',
                    'warning',
                )
                return
            }
            if (pendingApproval) {
                appendSystemMessage(
                    'History',
                    'Resolve current approval request before loading session history.',
                    'warning',
                )
                return
            }
            try {
                const raw = await readFile(entry.sessionFile, 'utf8')
                const parsed = parseHistoryLog(raw)
                dispatch({ type: 'clear_current_timeline' })
                dispatch({
                    type: 'replace_history',
                    turns: parsed.turns,
                    maxSequence: parsed.maxSequence,
                })
                setPendingHistoryMessages(parsed.messages)
                setBusy(false)
                setSession(null)
                setSessionLogPath(null)
                setCurrentContextTokens(0)
                currentTurnRef.current = null
                setSessionOptionsState((prev) => ({ ...prev, sessionId: randomUUID() }))
                appendSystemMessage('History', parsed.summary || entry.input)
            } catch (err) {
                appendSystemMessage(
                    'History',
                    `Failed to load ${entry.sessionFile}: ${(err as Error).message}`,
                    'error',
                )
            }
        },
        [appendSystemMessage, busy, dispatch, pendingApproval],
    )

    const handleCancelRun = useCallback(() => {
        if (!busy) return
        session?.cancelCurrentTurn?.()
    }, [busy, session])

    const runInitCommand = useCallback(async () => {
        if (!session || busy) return

        const prompt = `Please analyze the current project and create an AGENTS.md file at the project root.

The AGENTS.md should include:
1. Project name and brief description
2. Directory structure overview
3. Key technologies and stack
4. Coding conventions and style guidelines
5. Build/test/development commands
6. Any project-specific notes for AI assistants

Steps:
1. Explore project structure using list_dir and exec_command tools
2. Read key configuration files
3. Understand stack and conventions
4. Create AGENTS.md using apply_patch

Keep the result concise and actionable.`

        const initCommand = formatSlashCommand(SLASH_COMMANDS.INIT)
        setInputHistory((prev) => [...prev, initCommand])
        setBusy(true)
        try {
            nextUserInputOverrideRef.current = initCommand
            await session.runTurn(prompt)
        } catch (err) {
            setBusy(false)
            appendSystemMessage(
                'Init',
                `Failed to run init task: ${(err as Error).message}`,
                'error',
            )
        }
    }, [appendSystemMessage, busy, session])

    const handleSubmit = useCallback(
        async (value: string) => {
            const trimmed = value.trim()
            if (!trimmed) return

            if (trimmed.toLowerCase() === PLAIN_EXIT_COMMAND) {
                await handleExit()
                return
            }

            if (trimmed === formatSlashCommand(SLASH_COMMANDS.INIT)) {
                await runInitCommand()
                return
            }

            if (!session || busy) return

            setInputHistory((prev) => [...prev, trimmed])
            setBusy(true)
            try {
                await session.runTurn(trimmed)
            } catch (err) {
                setBusy(false)
                appendSystemMessage('Run', `Turn failed: ${(err as Error).message}`, 'error')
            }
        },
        [appendSystemMessage, busy, handleExit, runInitCommand, session],
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
            appendSystemMessage(
                'Setup',
                `Failed to reload config: ${(err as Error).message}`,
                'error',
            )
        }
    }, [appendSystemMessage])

    useEffect(() => {
        if (!session || !pendingHistoryMessages?.length) return
        const systemMessage = session.history[0]
        if (!systemMessage) return
        session.history.splice(0, session.history.length, systemMessage, ...pendingHistoryMessages)
        setPendingHistoryMessages(null)
    }, [pendingHistoryMessages, session])

    const handleApprovalDecision = useCallback((decision: ApprovalDecision) => {
        const resolver = approvalResolverRef.current
        if (resolver) {
            resolver(decision)
            approvalResolverRef.current = null
        }
        setPendingApproval(null)
    }, [])

    const tokenLine = formatTokenUsage(timeline.turns[timeline.turns.length - 1]?.tokenUsage)
    const contextPercent = calculateContextPercent(currentContextTokens, contextLimit)

    if (exitMessage) {
        return (
            <Box>
                <Text color="green">{exitMessage}</Text>
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

    if (mcpSelectionPending) {
        return (
            <McpActivationOverlay
                serverNames={availableMcpServerNames}
                defaultSelected={initialActiveMcpServers}
                onConfirm={handleConfirmMcpActivation}
                onExit={() => {
                    void handleExit()
                }}
            />
        )
    }

    return (
        <Box flexDirection="column">
            <ChatWidget
                header={{
                    providerName: currentProvider,
                    model: currentModel,
                    cwd,
                    sessionId: sessionOptionsState.sessionId ?? 'unknown',
                    mcpNames: activeMcpServerNames,
                    version: localPackageInfo?.version ?? 'unknown',
                }}
                systemMessages={timeline.systemMessages}
                turns={timeline.turns}
                historicalTurns={timeline.historicalTurns}
            />

            <Composer
                disabled={!session || !!pendingApproval}
                busy={busy}
                history={inputHistory}
                cwd={cwd}
                sessionsDir={sessionsDir}
                currentSessionFile={sessionLogPath ?? undefined}
                providers={providersState}
                configPath={configPath}
                providerName={currentProvider}
                model={currentModel}
                contextLimit={contextLimit}
                toolPermissionMode={toolPermissionMode}
                mcpServers={mcpServers}
                onSubmit={(input) => {
                    void handleSubmit(input)
                }}
                onExit={() => {
                    void handleExit()
                }}
                onClear={handleClear}
                onNewSession={handleNewSession}
                onCancelRun={handleCancelRun}
                onHistorySelect={(entry) => {
                    void handleHistorySelect(entry)
                }}
                onModelSelect={(provider) => {
                    void handleModelSelect(provider)
                }}
                onSetContextLimit={handleSetContextLimit}
                onSetToolPermission={handleSetToolPermission}
                onSystemMessage={appendSystemMessage}
            />

            {pendingApproval ? (
                <ApprovalOverlay request={pendingApproval} onDecision={handleApprovalDecision} />
            ) : null}

            <Footer
                busy={busy}
                pendingApproval={Boolean(pendingApproval)}
                contextPercent={contextPercent}
                tokenLine={tokenLine}
            />
        </Box>
    )
}
