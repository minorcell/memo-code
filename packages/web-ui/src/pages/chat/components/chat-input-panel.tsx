import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ArrowUp, Pencil, Square, Trash2, Zap } from 'lucide-react'
import { chatApi } from '@/api'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
    ChatProviderRecord,
    FileSuggestion,
    LiveSessionState,
    QueuedInputItem,
} from '@/api/types'

type ToolPermissionMode = 'none' | 'once' | 'full'
type ApprovalDecision = 'once' | 'session' | 'deny'

type FileTrigger = {
    query: string
    tokenStart: number
}

const SUGGESTION_DEBOUNCE_MS = 140
const KEY_NAV_THROTTLE_MS = 40

const TOOL_PERMISSION_OPTIONS: Array<{
    value: ToolPermissionMode
    label: string
}> = [
    { value: 'none', label: 'No tools' },
    { value: 'once', label: 'Ask each time' },
    { value: 'full', label: 'Full access' },
]

function detectFileTrigger(value: string): FileTrigger | null {
    const atIndex = value.lastIndexOf('@')
    if (atIndex === -1) return null
    if (atIndex > 0) {
        const prev = value[atIndex - 1]
        if (prev && !/\s/.test(prev)) return null
    }

    const after = value.slice(atIndex + 1)
    if (/\s/.test(after)) return null

    return {
        query: after,
        tokenStart: atIndex + 1,
    }
}

function formatSuggestionValue(item: FileSuggestion): string {
    return item.isDir ? `${item.path}/` : item.path
}

function isImeComposing(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    composing: boolean,
): boolean {
    const native = event.nativeEvent
    return composing || native.isComposing || native.key === 'Process' || native.keyCode === 229
}

type ChatInputPanelProps = {
    input: string
    onInputChange: (value: string) => void
    onSend: () => Promise<void> | void
    hasActiveSession: boolean
    isRunning: boolean
    liveSession: LiveSessionState | null
    pendingApproval?: LiveSessionState['pendingApproval']
    modelOptions: ChatProviderRecord[]
    loadingProviders: boolean
    onModelChange: (providerName: string) => Promise<void> | void
    onToolModeChange: (mode: ToolPermissionMode) => Promise<void> | void
    onCancelTurn: () => Promise<void> | void
    onApprovalDecision: (decision: ApprovalDecision) => Promise<void> | void
    sessionId?: string | null
    workspaceId?: string | null
    contextPercent: number
    queuedInputs: QueuedInputItem[]
    onEditQueuedInput: (item: QueuedInputItem) => Promise<void> | void
    onDeleteQueuedInput: (queueId: string) => Promise<void> | void
    onSendQueuedInputNow: () => Promise<void> | void
}

export function ChatInputPanel({
    input,
    onInputChange,
    onSend,
    hasActiveSession,
    isRunning,
    liveSession,
    pendingApproval,
    modelOptions,
    loadingProviders,
    onModelChange,
    onToolModeChange,
    onCancelTurn,
    onApprovalDecision,
    sessionId,
    workspaceId,
    contextPercent,
    queuedInputs,
    onEditQueuedInput,
    onDeleteQueuedInput,
    onSendQueuedInputNow,
}: ChatInputPanelProps) {
    const sendDisabled = !hasActiveSession || !input.trim()
    const clampedContextPercent = Math.max(0, Math.min(100, contextPercent))
    const contextPercentText = `${clampedContextPercent.toFixed(1)}%`
    const contextTextClass =
        clampedContextPercent >= 90
            ? 'text-destructive'
            : clampedContextPercent >= 75
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
    const escStateRef = useRef<{ count: number; ts: number }>({ count: 0, ts: 0 })
    const requestIdRef = useRef(0)
    const requestTimerRef = useRef<number | null>(null)
    const keyNavTsRef = useRef(0)
    const imeComposingRef = useRef(false)

    const [fileSuggestions, setFileSuggestions] = useState<FileSuggestion[]>([])
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
    const [loadingFileSuggestions, setLoadingFileSuggestions] = useState(false)
    const [approvalSubmitting, setApprovalSubmitting] = useState<ApprovalDecision | null>(null)

    const activeTrigger = useMemo(() => detectFileTrigger(input), [input])
    const hasFileSuggestions = fileSuggestions.length > 0

    useEffect(() => {
        if (requestTimerRef.current !== null) {
            window.clearTimeout(requestTimerRef.current)
            requestTimerRef.current = null
        }
        const generation = ++requestIdRef.current

        if (!activeTrigger || !hasActiveSession || (!sessionId && !workspaceId)) {
            setFileSuggestions([])
            setActiveSuggestionIndex(0)
            setLoadingFileSuggestions(false)
            return
        }

        requestTimerRef.current = window.setTimeout(() => {
            setLoadingFileSuggestions(true)

            void chatApi
                .suggestChatFiles({
                    query: activeTrigger.query,
                    sessionId: sessionId?.trim() || undefined,
                    workspaceId: sessionId?.trim() ? undefined : workspaceId?.trim() || undefined,
                    limit: 8,
                })
                .then((result) => {
                    if (generation !== requestIdRef.current) return
                    setFileSuggestions(result.items)
                    setActiveSuggestionIndex((prev) =>
                        result.items.length > 0 ? Math.min(prev, result.items.length - 1) : 0,
                    )
                })
                .catch(() => {
                    if (generation !== requestIdRef.current) return
                    setFileSuggestions([])
                    setActiveSuggestionIndex(0)
                })
                .finally(() => {
                    if (generation !== requestIdRef.current) return
                    setLoadingFileSuggestions(false)
                })
        }, SUGGESTION_DEBOUNCE_MS)

        return () => {
            if (requestTimerRef.current !== null) {
                window.clearTimeout(requestTimerRef.current)
                requestTimerRef.current = null
            }
        }
    }, [activeTrigger, hasActiveSession, sessionId, workspaceId])

    function applyFileSuggestion(item: FileSuggestion) {
        const trigger = activeTrigger
        if (!trigger) return

        const currentValue = input
        const prefix = currentValue.slice(0, trigger.tokenStart)
        const suffix = currentValue.slice(trigger.tokenStart + trigger.query.length)
        const inserted = formatSuggestionValue(item)

        onInputChange(`${prefix}${inserted}${suffix}`)
        if (!item.isDir) {
            setFileSuggestions([])
            setActiveSuggestionIndex(0)
            setLoadingFileSuggestions(false)
        }
    }

    async function handleApproval(decision: ApprovalDecision) {
        if (!pendingApproval) return
        if (approvalSubmitting) return
        setApprovalSubmitting(decision)
        try {
            await onApprovalDecision(decision)
        } finally {
            setApprovalSubmitting(null)
        }
    }

    return (
        <div className="mx-auto mb-2 w-[calc(100%-1rem)] max-w-[50.4rem] sm:mb-3 sm:w-[calc(100%-2rem)]">
            {pendingApproval ? (
                <div className="mb-2 rounded-lg border border-border/70 px-3 py-2">
                    <p className="text-xs font-medium text-foreground">
                        Approval required:{' '}
                        <span className="font-semibold">{pendingApproval.toolName}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{pendingApproval.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={approvalSubmitting !== null}
                            onClick={() => {
                                void handleApproval('once')
                            }}
                        >
                            Allow once
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            disabled={approvalSubmitting !== null}
                            onClick={() => {
                                void handleApproval('session')
                            }}
                        >
                            Allow session
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={approvalSubmitting !== null}
                            onClick={() => {
                                void handleApproval('deny')
                            }}
                        >
                            Deny
                        </Button>
                    </div>
                </div>
            ) : null}
            {queuedInputs.length > 0 ? (
                <div className="mx-auto mb-0 w-4/5 rounded-t-lg rounded-b-none border border-border/70 border-b-0 bg-muted/20 p-1.5">
                    <div className="mb-1 flex items-center justify-between gap-1.5">
                        <p className="text-xs font-medium text-foreground">
                            Queued messages ({queuedInputs.length}/3)
                        </p>
                        {isRunning ? (
                            <span className="text-[11px] text-muted-foreground">
                                Waiting for turn
                            </span>
                        ) : null}
                    </div>
                    <div className="space-y-1">
                        {queuedInputs.map((item, index) => (
                            <div
                                key={item.id}
                                className="rounded-md border border-border/60 bg-background/70 px-1.5 py-1"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="max-h-10 overflow-hidden text-xs text-foreground">
                                        {item.input}
                                    </p>
                                    <div className="flex shrink-0 items-center gap-1">
                                        {index === 0 ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-5 px-1.5 text-[10px]"
                                                onClick={() => {
                                                    void onSendQueuedInputNow()
                                                }}
                                                disabled={!hasActiveSession}
                                            >
                                                <Zap className="mr-1 size-2.5" />
                                                Send now
                                            </Button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            className="size-5"
                                            onClick={() => {
                                                void onEditQueuedInput(item)
                                            }}
                                            title="Edit queued message"
                                            disabled={!hasActiveSession}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            className="size-5"
                                            onClick={() => {
                                                void onDeleteQueuedInput(item.id)
                                            }}
                                            title="Delete queued message"
                                            disabled={!hasActiveSession}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            {(hasFileSuggestions || loadingFileSuggestions) && activeTrigger ? (
                <div className="mb-2 max-h-44 overflow-y-auto rounded-lg border border-border/70 bg-background/95 p-1.5">
                    {loadingFileSuggestions && !hasFileSuggestions ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                            Searching files...
                        </div>
                    ) : (
                        fileSuggestions.map((item, index) => {
                            const value = formatSuggestionValue(item)
                            const active = index === activeSuggestionIndex
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={cn(
                                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                        active ? 'bg-muted' : 'hover:bg-muted/70',
                                    )}
                                    onMouseDown={(event) => {
                                        event.preventDefault()
                                        applyFileSuggestion(item)
                                    }}
                                >
                                    <span className="truncate">@{value}</span>
                                    <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                                        {item.isDir ? 'dir' : 'file'}
                                    </span>
                                </button>
                            )
                        })
                    )}
                </div>
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-transparent px-3 py-2.5 dark:bg-transparent">
                <Textarea
                    value={input}
                    onChange={(event) => onInputChange(event.target.value)}
                    onCompositionStart={() => {
                        imeComposingRef.current = true
                    }}
                    onCompositionEnd={() => {
                        imeComposingRef.current = false
                    }}
                    onKeyDown={(event) => {
                        if (isImeComposing(event, imeComposingRef.current)) {
                            return
                        }

                        if (hasFileSuggestions) {
                            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                event.preventDefault()
                                const now = Date.now()
                                if (now - keyNavTsRef.current < KEY_NAV_THROTTLE_MS) return
                                keyNavTsRef.current = now

                                setActiveSuggestionIndex((current) => {
                                    if (fileSuggestions.length === 0) return 0
                                    if (event.key === 'ArrowDown') {
                                        return (current + 1) % fileSuggestions.length
                                    }
                                    return current <= 0 ? fileSuggestions.length - 1 : current - 1
                                })
                                return
                            }

                            if (event.key === 'Tab') {
                                event.preventDefault()
                                const suggestion =
                                    fileSuggestions[activeSuggestionIndex] ??
                                    fileSuggestions[0] ??
                                    null
                                if (suggestion) {
                                    applyFileSuggestion(suggestion)
                                }
                                return
                            }

                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                const suggestion =
                                    fileSuggestions[activeSuggestionIndex] ??
                                    fileSuggestions[0] ??
                                    null
                                if (suggestion) {
                                    applyFileSuggestion(suggestion)
                                }
                                return
                            }

                            if (event.key === 'Escape') {
                                event.preventDefault()
                                setFileSuggestions([])
                                setActiveSuggestionIndex(0)
                                setLoadingFileSuggestions(false)
                                escStateRef.current = { count: 0, ts: 0 }
                                return
                            }
                        }

                        if (event.key === 'Escape') {
                            if (!isRunning || !hasActiveSession) {
                                escStateRef.current = { count: 0, ts: 0 }
                                return
                            }

                            event.preventDefault()
                            const now = Date.now()
                            const withinWindow = now - escStateRef.current.ts <= 900
                            const nextCount = withinWindow ? escStateRef.current.count + 1 : 1
                            escStateRef.current = { count: nextCount, ts: now }

                            if (nextCount >= 3) {
                                escStateRef.current = { count: 0, ts: 0 }
                                void onCancelTurn()
                            }
                            return
                        }

                        escStateRef.current = { count: 0, ts: 0 }
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            if (!sendDisabled) {
                                void onSend()
                            }
                        }
                    }}
                    placeholder="Ask for follow-up changes"
                    className="min-h-[52px] w-full resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                    rows={Math.max(2, Math.min(5, input.split('\n').length || 1))}
                    disabled={!hasActiveSession}
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'inline-flex items-center rounded-full border border-border/70 px-2 py-0.5',
                            contextTextClass,
                        )}
                        title={`Context used: ${contextPercentText}`}
                        aria-label={`Context used: ${contextPercentText}`}
                    >
                        <span className="text-[11px] font-medium tabular-nums">
                            {contextPercentText}
                        </span>
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-muted-foreground">
                        <Select
                            value={liveSession?.providerName ?? undefined}
                            onValueChange={(value) => {
                                void onModelChange(value)
                            }}
                            disabled={
                                !hasActiveSession ||
                                isRunning ||
                                loadingProviders ||
                                modelOptions.length === 0
                            }
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-6 min-w-[112px] border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none focus-visible:ring-0 sm:min-w-[128px] dark:bg-transparent dark:hover:bg-transparent"
                            >
                                <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                                {modelOptions.map((provider) => (
                                    <SelectItem key={provider.name} value={provider.name}>
                                        {provider.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={liveSession?.toolPermissionMode ?? undefined}
                            onValueChange={(value) => {
                                if (value === 'none' || value === 'once' || value === 'full') {
                                    void onToolModeChange(value)
                                }
                            }}
                            disabled={!hasActiveSession || isRunning}
                        >
                            <SelectTrigger
                                size="sm"
                                className="h-6 min-w-[104px] border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none focus-visible:ring-0 sm:min-w-[112px] dark:bg-transparent dark:hover:bg-transparent"
                            >
                                <SelectValue placeholder="Tool permission" />
                            </SelectTrigger>
                            <SelectContent>
                                {TOOL_PERMISSION_OPTIONS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                        {item.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                        {isRunning ? (
                            <Button
                                type="button"
                                onClick={() => {
                                    void onCancelTurn()
                                }}
                                disabled={!hasActiveSession}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full bg-foreground text-background transition-colors hover:opacity-90"
                                aria-label="Interrupt turn"
                                title="Interrupt turn (Esc Esc Esc)"
                            >
                                <Square className="size-3.5" />
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            onClick={() => {
                                if (!sendDisabled) {
                                    void onSend()
                                }
                            }}
                            disabled={sendDisabled}
                            size="icon"
                            variant="ghost"
                            className={cn(
                                'h-8 w-8 rounded-full transition-colors',
                                sendDisabled
                                    ? 'bg-muted text-muted-foreground/50'
                                    : 'bg-foreground text-background hover:opacity-90',
                            )}
                            aria-label={isRunning ? 'Queue message' : 'Send message'}
                            title={isRunning ? 'Queue message' : 'Send message'}
                        >
                            <ArrowUp className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
