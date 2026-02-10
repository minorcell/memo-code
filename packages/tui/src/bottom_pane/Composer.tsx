import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { MCPServerConfig, ProviderConfig } from '@memo/core'
import { resolveSlashCommand, SLASH_SPECS } from '../slash/registry'
import type { SlashContext } from '../slash/types'
import { getFileSuggestions } from '../controllers/file_suggestions'
import { loadSessionHistoryEntries, type SessionHistoryEntry } from '../controllers/session_history'
import { SuggestionPanel, type SuggestionItem } from './SuggestionPanel'
import {
    CONTEXT_LIMIT_CHOICES,
    formatSlashCommand,
    SLASH_COMMANDS,
    TOOL_PERMISSION_MODES,
    type ToolPermissionMode,
} from '../constants'

const DOUBLE_ESC_WINDOW_MS = 400
const MODELS_SLASH_PREFIX = formatSlashCommand(SLASH_COMMANDS.MODELS)
const CONTEXT_SLASH_PREFIX = formatSlashCommand(SLASH_COMMANDS.CONTEXT)
const TOOLS_SLASH_PREFIX = formatSlashCommand(SLASH_COMMANDS.TOOLS)
const INIT_SLASH_COMMAND = formatSlashCommand(SLASH_COMMANDS.INIT)
const TOOL_MODE_OPTIONS: Array<{ mode: ToolPermissionMode; description: string }> = [
    { mode: TOOL_PERMISSION_MODES.NONE, description: 'Disable all tool calls' },
    { mode: TOOL_PERMISSION_MODES.ONCE, description: 'Require approval when needed' },
    { mode: TOOL_PERMISSION_MODES.FULL, description: 'Run tools without approval' },
]

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
    toolPermissionMode: ToolPermissionMode
    mcpServers: Record<string, MCPServerConfig>
    onSubmit: (value: string) => void
    onExit: () => void
    onClear: () => void
    onNewSession: () => void
    onCancelRun: () => void
    onHistorySelect: (entry: SessionHistoryEntry) => void
    onModelSelect: (provider: ProviderConfig) => void
    onSetContextLimit: (limit: number) => void
    onSetToolPermission: (mode: ToolPermissionMode) => void
    onSystemMessage: (title: string, content: string) => void
}

type SuggestionMode = 'none' | 'file' | 'history' | 'slash' | 'model' | 'context' | 'tools'

type SuggestionMeta =
    | { type: 'file'; isDir?: boolean }
    | { type: 'history'; entry: SessionHistoryEntry }
    | { type: 'slash' }
    | { type: 'model'; provider: ProviderConfig }
    | { type: 'context'; value: number }
    | { type: 'tools'; mode: ToolPermissionMode }

type SuggestionRecord = SuggestionItem & {
    value: string
    meta?: SuggestionMeta
}

type FileTrigger = { type: 'file'; query: string; tokenStart: number }
type HistoryTrigger = { type: 'history'; keyword: string }
type SlashTrigger = { type: 'slash'; keyword: string }
type ModelTrigger = { type: 'models'; keyword: string }
type ContextTrigger = { type: 'context' }
type ToolsTrigger = { type: 'tools' }
type Trigger =
    | FileTrigger
    | HistoryTrigger
    | SlashTrigger
    | ModelTrigger
    | ContextTrigger
    | ToolsTrigger

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

function detectToolsTrigger(value: string): ToolsTrigger | null {
    const trimmed = value.trimStart()
    if (!trimmed.startsWith(TOOLS_SLASH_PREFIX)) return null
    const rest = trimmed.slice(TOOLS_SLASH_PREFIX.length)
    if (rest && !rest.startsWith(' ')) return null
    return { type: 'tools' }
}

function detectTrigger(value: string): Trigger | null {
    return (
        detectToolsTrigger(value) ??
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

type SuggestionBuildInput = {
    trigger: Trigger
    cwd: string
    sessionsDir: string
    currentSessionFile?: string
    providers: ProviderConfig[]
    contextLimit: number
    toolPermissionMode: ToolPermissionMode
}

type SuggestionBuildResult = {
    mode: SuggestionMode
    items: SuggestionRecord[]
}

function buildModelSuggestions(
    providers: ProviderConfig[],
    keyword: string,
): SuggestionBuildResult {
    const items: SuggestionRecord[] = providers
        .filter((provider) => {
            if (!keyword) return true
            const name = provider.name.toLowerCase()
            const modelName = provider.model.toLowerCase()
            return name.includes(keyword) || modelName.includes(keyword)
        })
        .map((provider) => ({
            id: provider.name,
            title: `${provider.name}: ${provider.model}`,
            subtitle: provider.base_url,
            kind: 'model',
            value: `${MODELS_SLASH_PREFIX} ${provider.name}`,
            meta: { type: 'model', provider },
        }))

    return { mode: 'model', items }
}

function buildContextSuggestions(contextLimit: number): SuggestionBuildResult {
    const items: SuggestionRecord[] = CONTEXT_LIMIT_CHOICES.map((choice) => ({
        id: `${choice}`,
        title: `${Math.floor(choice / 1000)}k tokens`,
        subtitle: choice === contextLimit ? 'Current' : undefined,
        kind: 'context',
        value: `${CONTEXT_SLASH_PREFIX} ${Math.floor(choice / 1000)}k`,
        meta: { type: 'context', value: choice },
    }))
    return { mode: 'context', items }
}

function buildToolSuggestions(toolPermissionMode: ToolPermissionMode): SuggestionBuildResult {
    const items: SuggestionRecord[] = TOOL_MODE_OPTIONS.map((option) => ({
        id: option.mode,
        title: option.mode,
        subtitle:
            option.mode === toolPermissionMode
                ? `Current · ${option.description}`
                : option.description,
        kind: 'tools',
        value: `${TOOLS_SLASH_PREFIX} ${option.mode}`,
        meta: { type: 'tools', mode: option.mode },
    }))
    return { mode: 'tools', items }
}

function buildSlashSuggestions(keyword: string): SuggestionBuildResult {
    const items: SuggestionRecord[] = SLASH_SPECS.filter((spec) =>
        spec.name.startsWith(keyword),
    ).map((spec) => ({
        id: spec.name,
        title: `/${spec.name}`,
        subtitle: spec.description,
        kind: 'slash',
        value: `/${spec.name}`,
        meta: { type: 'slash' },
    }))

    return { mode: 'slash', items }
}

async function buildSuggestionsForTrigger({
    trigger,
    cwd,
    sessionsDir,
    currentSessionFile,
    providers,
    contextLimit,
    toolPermissionMode,
}: SuggestionBuildInput): Promise<SuggestionBuildResult> {
    switch (trigger.type) {
        case 'file': {
            const matches = await getFileSuggestions({
                cwd,
                query: trigger.query,
                limit: 8,
            })
            const items: SuggestionRecord[] = matches.map((match) => ({
                id: match.id,
                title: match.isDir ? `${match.path}/` : match.path,
                kind: 'file',
                value: match.isDir ? `${match.path}/` : match.path,
                meta: { type: 'file', isDir: match.isDir },
            }))
            return { mode: 'file', items }
        }

        case 'history': {
            const entries = await loadSessionHistoryEntries({
                sessionsDir,
                cwd,
                keyword: trigger.keyword,
                activeSessionFile: currentSessionFile,
            })
            const items: SuggestionRecord[] = entries.map((entry) => ({
                id: entry.id,
                title: entry.input,
                subtitle: formatTimestamp(entry.ts),
                kind: 'history',
                value: entry.input,
                meta: { type: 'history', entry },
            }))
            return { mode: 'history', items }
        }

        case 'models':
            return buildModelSuggestions(providers, trigger.keyword)

        case 'context':
            return buildContextSuggestions(contextLimit)

        case 'tools':
            return buildToolSuggestions(toolPermissionMode)

        case 'slash':
            return buildSlashSuggestions(trigger.keyword)
    }
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
    toolPermissionMode,
    mcpServers,
    onSubmit,
    onExit,
    onClear,
    onNewSession,
    onCancelRun,
    onHistorySelect,
    onModelSelect,
    onSetContextLimit,
    onSetToolPermission,
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
            toolPermissionMode,
        }),
        [configPath, providerName, model, mcpServers, providers, contextLimit, toolPermissionMode],
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

    const setComposerValue = useCallback((next: string) => {
        valueRef.current = next
        setValue(next)
        setHistoryIndex(null)
        setDraft('')
    }, [])

    const clearComposerValue = useCallback(() => {
        setComposerValue('')
    }, [setComposerValue])

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
                const { mode: nextMode, items: nextItems } = await buildSuggestionsForTrigger({
                    trigger,
                    cwd,
                    sessionsDir,
                    currentSessionFile,
                    providers,
                    contextLimit,
                    toolPermissionMode,
                })
                if (cancelled || requestId !== requestIdRef.current) return
                setMode(nextMode)
                setItems(nextItems)
                setActiveIndex((prev) =>
                    nextItems.length ? Math.min(prev, nextItems.length - 1) : 0,
                )
            } finally {
                if (!cancelled && requestId === requestIdRef.current) {
                    setLoading(false)
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [
        trigger,
        cwd,
        sessionsDir,
        currentSessionFile,
        providers,
        contextLimit,
        toolPermissionMode,
        closeSuggestions,
    ])

    const applySuggestion = useCallback(
        (record?: SuggestionRecord) => {
            if (!record) return

            if (mode === 'file' && trigger?.type === 'file') {
                const prefix = value.slice(0, trigger.tokenStart)
                const suffix = value.slice(trigger.tokenStart + trigger.query.length)
                const next = `${prefix}${record.value}${suffix}`
                setComposerValue(next)
                if (!(record.meta?.type === 'file' && record.meta.isDir)) {
                    closeSuggestions()
                }
                return
            }

            switch (record.meta?.type) {
                case 'history':
                    onHistorySelect(record.meta.entry)
                    setComposerValue(record.value)
                    closeSuggestions()
                    return

                case 'model':
                    onModelSelect(record.meta.provider)
                    clearComposerValue()
                    closeSuggestions()
                    return

                case 'context':
                    onSetContextLimit(record.meta.value)
                    clearComposerValue()
                    closeSuggestions()
                    return

                case 'tools':
                    onSetToolPermission(record.meta.mode)
                    clearComposerValue()
                    closeSuggestions()
                    return

                case 'slash':
                    setComposerValue(`${record.value} `)
                    closeSuggestions(false)
                    return

                default:
                    setComposerValue(record.value)
                    closeSuggestions()
            }
        },
        [
            mode,
            trigger,
            value,
            closeSuggestions,
            setComposerValue,
            clearComposerValue,
            onHistorySelect,
            onModelSelect,
            onSetContextLimit,
            onSetToolPermission,
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
                } else if (result.kind === 'set_tool_permission') {
                    onSetToolPermission(result.mode)
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
            if (input.includes('\n')) {
                closeSuggestions(false)
            }
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
                        {index === lines.length - 2 && !disabled && line === '' ? (
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
