import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { MCPServerConfig, ProviderConfig } from '@memo/core'
import { resolveSlashCommand, SLASH_SPECS } from '../slash/registry'
import type { SlashContext } from '../slash/types'
import { getFileSuggestions } from '../controllers/file_suggestions'
import { loadSessionHistoryEntries, type SessionHistoryEntry } from '../controllers/session_history'
import { SuggestionPanel, type SuggestionItem } from './SuggestionPanel'
import { CONTEXT_LIMIT_CHOICES, formatSlashCommand, SLASH_COMMANDS } from '../constants'

const DOUBLE_ESC_WINDOW_MS = 400
const MODELS_SLASH_PREFIX = formatSlashCommand(SLASH_COMMANDS.MODELS)
const CONTEXT_SLASH_PREFIX = formatSlashCommand(SLASH_COMMANDS.CONTEXT)
const INIT_SLASH_COMMAND = formatSlashCommand(SLASH_COMMANDS.INIT)

type ComposerProps = {
    disabled: boolean
    busy: boolean
    history: string[]
    cwd: string
    sessionsDir: string
    currentSessionFile?: string
    providers: ProviderConfig[]
    configPath: string
    providerName: string
    model: string
    contextLimit: number
    mcpServers: Record<string, MCPServerConfig>
    onSubmit: (value: string) => void
    onExit: () => void
    onClear: () => void
    onNewSession: () => void
    onCancelRun: () => void
    onHistorySelect: (entry: SessionHistoryEntry) => void
    onModelSelect: (provider: ProviderConfig) => void
    onSetContextLimit: (limit: number) => void
    onSystemMessage: (title: string, content: string) => void
}

type SuggestionMode = 'none' | 'file' | 'history' | 'slash' | 'model' | 'context'

type SuggestionMeta =
    | { type: 'file'; isDir?: boolean }
    | { type: 'history'; entry: SessionHistoryEntry }
    | { type: 'slash' }
    | { type: 'model'; provider: ProviderConfig }
    | { type: 'context'; value: number }

type SuggestionRecord = SuggestionItem & {
    value: string
    meta?: SuggestionMeta
}

type FileTrigger = { type: 'file'; query: string; tokenStart: number }
type HistoryTrigger = { type: 'history'; keyword: string }
type SlashTrigger = { type: 'slash'; keyword: string }
type ModelTrigger = { type: 'models'; keyword: string }
type ContextTrigger = { type: 'context' }
type Trigger = FileTrigger | HistoryTrigger | SlashTrigger | ModelTrigger | ContextTrigger

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
        type: 'file',
        query: after,
        tokenStart: atIndex + 1,
    }
}

function detectHistoryTrigger(value: string): HistoryTrigger | null {
    const trimmedStart = value.trimStart()
    const prefixLength = value.length - trimmedStart.length
    if (!trimmedStart.length) return null

    let normalized = trimmedStart
    if (normalized.startsWith('/')) {
        normalized = normalized.slice(1)
    }
    if (!normalized.toLowerCase().startsWith(SLASH_COMMANDS.RESUME)) return null
    const hasOtherPrefix = value.slice(0, prefixLength).trim().length > 0
    if (hasOtherPrefix) return null

    const rest = normalized.slice(SLASH_COMMANDS.RESUME.length)
    if (rest && !rest.startsWith(' ')) return null

    return {
        type: 'history',
        keyword: rest.trim(),
    }
}

function detectSlashTrigger(value: string): SlashTrigger | null {
    const trimmed = value.trimStart()
    if (!trimmed.startsWith('/')) return null
    const keyword = trimmed.slice(1)
    if (keyword.includes(' ')) return null
    if (!keyword.length) return { type: 'slash', keyword: '' }
    if (/^[a-zA-Z-]+$/.test(keyword)) {
        return { type: 'slash', keyword: keyword.toLowerCase() }
    }
    return null
}

function detectModelsTrigger(value: string): ModelTrigger | null {
    const trimmed = value.trimStart()
    if (!trimmed.startsWith(MODELS_SLASH_PREFIX)) return null
    const rest = trimmed.slice(MODELS_SLASH_PREFIX.length)
    if (rest && !rest.startsWith(' ')) return null
    return {
        type: 'models',
        keyword: rest.trim().toLowerCase(),
    }
}

function detectContextTrigger(value: string): ContextTrigger | null {
    const trimmed = value.trimStart()
    if (!trimmed.startsWith(CONTEXT_SLASH_PREFIX)) return null
    const rest = trimmed.slice(CONTEXT_SLASH_PREFIX.length)
    if (rest && !rest.startsWith(' ')) return null
    return { type: 'context' }
}

function detectTrigger(value: string): Trigger | null {
    return (
        detectContextTrigger(value) ??
        detectModelsTrigger(value) ??
        detectSlashTrigger(value) ??
        detectFileTrigger(value) ??
        detectHistoryTrigger(value)
    )
}

function formatTimestamp(ts: number): string {
    const date = new Date(ts)
    if (Number.isNaN(date.getTime())) return ''
    const yyyy = String(date.getFullYear())
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const HH = String(date.getHours()).padStart(2, '0')
    const MM = String(date.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}`
}

export function Composer({
    disabled,
    busy,
    history,
    cwd,
    sessionsDir,
    currentSessionFile,
    providers,
    configPath,
    providerName,
    model,
    contextLimit,
    mcpServers,
    onSubmit,
    onExit,
    onClear,
    onNewSession,
    onCancelRun,
    onHistorySelect,
    onModelSelect,
    onSetContextLimit,
    onSystemMessage,
}: ComposerProps) {
    const [value, setValue] = useState('')
    const valueRef = useRef('')

    const [historyIndex, setHistoryIndex] = useState<number | null>(null)
    const [draft, setDraft] = useState('')

    const [mode, setMode] = useState<SuggestionMode>('none')
    const [items, setItems] = useState<SuggestionRecord[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const [loading, setLoading] = useState(false)
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)

    const requestIdRef = useRef(0)
    const lastEscTimeRef = useRef(0)

    useEffect(() => {
        valueRef.current = value
        setSuppressSuggestions(false)
    }, [value])

    const slashContext = useMemo<SlashContext>(
        () => ({
            configPath,
            providerName,
            model,
            mcpServers,
            providers,
            contextLimit,
        }),
        [configPath, providerName, model, mcpServers, providers, contextLimit],
    )

    const trigger = useMemo(() => {
        if (disabled || suppressSuggestions) return null
        return detectTrigger(value)
    }, [disabled, suppressSuggestions, value])

    const closeSuggestions = useCallback((suppress = true) => {
        if (suppress) setSuppressSuggestions(true)
        setMode('none')
        setItems([])
        setActiveIndex(0)
        setLoading(false)
    }, [])

    useEffect(() => {
        if (disabled) {
            closeSuggestions(false)
        }
    }, [disabled, closeSuggestions])

    useEffect(() => {
        if (!trigger) {
            closeSuggestions(false)
            return
        }

        let cancelled = false
        const requestId = ++requestIdRef.current
        setLoading(true)
        ;(async () => {
            try {
                if (trigger.type === 'file') {
                    const matches = await getFileSuggestions({
                        cwd,
                        query: trigger.query,
                        limit: 8,
                    })
                    if (cancelled || requestId !== requestIdRef.current) return
                    const mapped: SuggestionRecord[] = matches.map((match) => ({
                        id: match.id,
                        title: match.isDir ? `${match.path}/` : match.path,
                        kind: 'file',
                        value: match.isDir ? `${match.path}/` : match.path,
                        meta: { type: 'file', isDir: match.isDir },
                    }))
                    setMode('file')
                    setItems(mapped)
                    setActiveIndex((prev) =>
                        mapped.length ? Math.min(prev, mapped.length - 1) : 0,
                    )
                    return
                }

                if (trigger.type === 'history') {
                    const entries = await loadSessionHistoryEntries({
                        sessionsDir,
                        cwd,
                        keyword: trigger.keyword,
                        activeSessionFile: currentSessionFile,
                    })
                    if (cancelled || requestId !== requestIdRef.current) return
                    const mapped: SuggestionRecord[] = entries.map((entry) => ({
                        id: entry.id,
                        title: entry.input,
                        subtitle: formatTimestamp(entry.ts),
                        kind: 'history',
                        value: entry.input,
                        meta: { type: 'history', entry },
                    }))
                    setMode('history')
                    setItems(mapped)
                    setActiveIndex((prev) =>
                        mapped.length ? Math.min(prev, mapped.length - 1) : 0,
                    )
                    return
                }

                if (trigger.type === 'models') {
                    const mapped: SuggestionRecord[] = providers
                        .filter((provider) => {
                            if (!trigger.keyword) return true
                            const name = provider.name.toLowerCase()
                            const modelName = provider.model.toLowerCase()
                            return (
                                name.includes(trigger.keyword) ||
                                modelName.includes(trigger.keyword)
                            )
                        })
                        .map((provider) => ({
                            id: provider.name,
                            title: `${provider.name}: ${provider.model}`,
                            subtitle: provider.base_url,
                            kind: 'model',
                            value: `${MODELS_SLASH_PREFIX} ${provider.name}`,
                            meta: { type: 'model', provider },
                        }))
                    setMode('model')
                    setItems(mapped)
                    setActiveIndex((prev) =>
                        mapped.length ? Math.min(prev, mapped.length - 1) : 0,
                    )
                    return
                }

                if (trigger.type === 'context') {
                    const mapped: SuggestionRecord[] = CONTEXT_LIMIT_CHOICES.map((choice) => ({
                        id: `${choice}`,
                        title: `${Math.floor(choice / 1000)}k tokens`,
                        subtitle: choice === contextLimit ? 'Current' : undefined,
                        kind: 'context',
                        value: `${CONTEXT_SLASH_PREFIX} ${Math.floor(choice / 1000)}k`,
                        meta: { type: 'context', value: choice },
                    }))
                    setMode('context')
                    setItems(mapped)
                    setActiveIndex((prev) =>
                        mapped.length ? Math.min(prev, mapped.length - 1) : 0,
                    )
                    return
                }

                if (trigger.type === 'slash') {
                    const mapped: SuggestionRecord[] = SLASH_SPECS.filter((spec) =>
                        spec.name.startsWith(trigger.keyword),
                    ).map((spec) => ({
                        id: spec.name,
                        title: `/${spec.name}`,
                        subtitle: spec.description,
                        kind: 'slash',
                        value: `/${spec.name}`,
                        meta: { type: 'slash' },
                    }))

                    setMode('slash')
                    setItems(mapped)
                    setActiveIndex((prev) =>
                        mapped.length ? Math.min(prev, mapped.length - 1) : 0,
                    )
                }
            } finally {
                if (!cancelled && requestId === requestIdRef.current) {
                    setLoading(false)
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [trigger, cwd, sessionsDir, currentSessionFile, providers, contextLimit, closeSuggestions])

    const applySuggestion = useCallback(
        (record?: SuggestionRecord) => {
            if (!record) return

            if (mode === 'file' && trigger?.type === 'file') {
                const prefix = value.slice(0, trigger.tokenStart)
                const suffix = value.slice(trigger.tokenStart + trigger.query.length)
                const next = `${prefix}${record.value}${suffix}`
                valueRef.current = next
                setValue(next)
                setHistoryIndex(null)
                setDraft('')
                if (!(record.meta?.type === 'file' && record.meta.isDir)) {
                    closeSuggestions()
                }
                return
            }

            if (record.meta?.type === 'history') {
                onHistorySelect(record.meta.entry)
                valueRef.current = record.value
                setValue(record.value)
                setHistoryIndex(null)
                setDraft('')
                closeSuggestions()
                return
            }

            if (record.meta?.type === 'model') {
                onModelSelect(record.meta.provider)
                valueRef.current = ''
                setValue('')
                setHistoryIndex(null)
                setDraft('')
                closeSuggestions()
                return
            }

            if (record.meta?.type === 'context') {
                onSetContextLimit(record.meta.value)
                onSystemMessage(
                    'Context',
                    `Context limit set to ${Math.floor(record.meta.value / 1000)}k`,
                )
                valueRef.current = ''
                setValue('')
                setHistoryIndex(null)
                setDraft('')
                closeSuggestions()
                return
            }

            if (record.meta?.type === 'slash') {
                valueRef.current = `${record.value} `
                setValue(`${record.value} `)
                setHistoryIndex(null)
                setDraft('')
                closeSuggestions(false)
                return
            }

            valueRef.current = record.value
            setValue(record.value)
            setHistoryIndex(null)
            setDraft('')
            closeSuggestions()
        },
        [
            mode,
            trigger,
            value,
            closeSuggestions,
            onHistorySelect,
            onModelSelect,
            onSetContextLimit,
            onSystemMessage,
        ],
    )

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            onExit()
            return
        }

        if (key.ctrl && input === 'l') {
            valueRef.current = ''
            setValue('')
            setHistoryIndex(null)
            setDraft('')
            closeSuggestions()
            onClear()
            onNewSession()
            return
        }

        const hasSuggestions = mode !== 'none'
        const canNavigate = hasSuggestions && items.length > 0

        if (key.escape) {
            const now = Date.now()
            if (now - lastEscTimeRef.current <= DOUBLE_ESC_WINDOW_MS) {
                lastEscTimeRef.current = 0
                if (busy) {
                    onCancelRun()
                } else {
                    valueRef.current = ''
                    setValue('')
                    setHistoryIndex(null)
                    setDraft('')
                    closeSuggestions()
                }
                return
            }
            lastEscTimeRef.current = now
            if (hasSuggestions) closeSuggestions()
            return
        }

        if (disabled) return

        if (key.upArrow) {
            if (canNavigate) {
                setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
                return
            }
            if (!history.length) return
            if (historyIndex === null) {
                setDraft(valueRef.current)
                const nextIndex = history.length - 1
                setHistoryIndex(nextIndex)
                const next = history[nextIndex] ?? ''
                valueRef.current = next
                setValue(next)
                return
            }
            const nextIndex = Math.max(0, historyIndex - 1)
            setHistoryIndex(nextIndex)
            const next = history[nextIndex] ?? ''
            valueRef.current = next
            setValue(next)
            return
        }

        if (key.downArrow) {
            if (canNavigate) {
                setActiveIndex((prev) => (prev + 1) % items.length)
                return
            }
            if (historyIndex === null) return
            const nextIndex = historyIndex + 1
            if (nextIndex >= history.length) {
                setHistoryIndex(null)
                valueRef.current = draft
                setValue(draft)
                setDraft('')
                return
            }
            setHistoryIndex(nextIndex)
            const next = history[nextIndex] ?? ''
            valueRef.current = next
            setValue(next)
            return
        }

        if (key.tab && canNavigate) {
            applySuggestion(items[activeIndex])
            return
        }

        if (key.return) {
            if (canNavigate) {
                applySuggestion(items[activeIndex])
                return
            }

            if (key.shift) {
                const next = `${valueRef.current}\n`
                valueRef.current = next
                setValue(next)
                return
            }

            const trimmed = valueRef.current.trim()
            if (!trimmed) return

            if (trimmed.startsWith('/')) {
                const result = resolveSlashCommand(trimmed, slashContext)
                if (result.kind === 'message') {
                    onSystemMessage(result.title, result.content)
                } else if (result.kind === 'new') {
                    onNewSession()
                } else if (result.kind === 'exit') {
                    onExit()
                } else if (result.kind === 'switch_model') {
                    onModelSelect(result.provider)
                } else if (result.kind === 'set_context_limit') {
                    onSetContextLimit(result.limit)
                } else if (result.kind === 'init_agents_md') {
                    onSubmit(INIT_SLASH_COMMAND)
                }
                valueRef.current = ''
                setValue('')
                setHistoryIndex(null)
                setDraft('')
                closeSuggestions(false)
                return
            }

            onSubmit(trimmed)
            valueRef.current = ''
            setValue('')
            setHistoryIndex(null)
            setDraft('')
            closeSuggestions(false)
            return
        }

        if (key.backspace || key.delete) {
            const next = valueRef.current.slice(0, Math.max(0, valueRef.current.length - 1))
            valueRef.current = next
            setValue(next)
            return
        }

        if (input) {
            const next = `${valueRef.current}${input}`
            valueRef.current = next
            setValue(next)
        }
    })

    const lines = value.split('\n')

    return (
        <Box flexDirection="column" gap={1}>
            <Box flexDirection="column" paddingY={1}>
                <Box>
                    <Text color="gray">› </Text>
                    <Text>{lines[0] ?? ''}</Text>
                    {!disabled && lines.length === 1 ? <Text color="cyan">▊</Text> : null}
                </Box>
                {lines.slice(1).map((line, index) => (
                    <Box key={`line-${index}`}>
                        <Text color="gray"> </Text>
                        <Text>{line}</Text>
                        {index === lines.length - 2 && !disabled ? (
                            <Text color="cyan">▊</Text>
                        ) : null}
                    </Box>
                ))}
            </Box>

            {mode !== 'none' ? (
                <SuggestionPanel
                    items={items.map(({ value: _value, meta: _meta, ...display }) => display)}
                    activeIndex={activeIndex}
                    loading={loading}
                />
            ) : null}
        </Box>
    )
}
