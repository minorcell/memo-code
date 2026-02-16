import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'memo_web_preferences'
const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 18

type PersistedSystemSettings = {
    theme: ThemeMode
    fontSize: number
    autoCompact: boolean
}

type SystemSettingsStore = PersistedSystemSettings & {
    setTheme: (theme: ThemeMode) => void
    setFontSize: (fontSize: number) => void
    setAutoCompact: (enabled: boolean) => void
    toggleAutoCompact: () => void
}

const DEFAULT_SETTINGS: PersistedSystemSettings = {
    theme: 'system',
    fontSize: 14,
    autoCompact: true,
}

function clampFontSize(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_SETTINGS.fontSize
    const normalized = Math.floor(value)
    if (normalized < MIN_FONT_SIZE) return MIN_FONT_SIZE
    if (normalized > MAX_FONT_SIZE) return MAX_FONT_SIZE
    return normalized
}

function normalizePersistedSettings(value: unknown): PersistedSystemSettings {
    if (!value || typeof value !== 'object') return DEFAULT_SETTINGS

    const record = value as Partial<PersistedSystemSettings>
    return {
        theme:
            record.theme === 'light' || record.theme === 'dark' || record.theme === 'system'
                ? record.theme
                : DEFAULT_SETTINGS.theme,
        fontSize:
            typeof record.fontSize === 'number'
                ? clampFontSize(record.fontSize)
                : DEFAULT_SETTINGS.fontSize,
        autoCompact:
            typeof record.autoCompact === 'boolean'
                ? record.autoCompact
                : DEFAULT_SETTINGS.autoCompact,
    }
}

function isSystemDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme: ThemeMode): void {
    if (typeof document === 'undefined') return
    const useDark = theme === 'dark' || (theme === 'system' && isSystemDark())
    document.documentElement.classList.toggle('dark', useDark)
}

export function applyFontSize(px: number): void {
    if (typeof document === 'undefined') return
    document.documentElement.style.fontSize = `${clampFontSize(px)}px`
}

export const useSystemSettingsStore = create<SystemSettingsStore>()(
    persist(
        (set) => ({
            ...DEFAULT_SETTINGS,
            setTheme(theme) {
                set({ theme })
            },
            setFontSize(fontSize) {
                set({ fontSize: clampFontSize(fontSize) })
            },
            setAutoCompact(enabled) {
                set({ autoCompact: enabled })
            },
            toggleAutoCompact() {
                set((state) => ({ autoCompact: !state.autoCompact }))
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state) => ({
                theme: state.theme,
                fontSize: state.fontSize,
                autoCompact: state.autoCompact,
            }),
            merge: (persistedState, currentState) => ({
                ...currentState,
                ...normalizePersistedSettings(persistedState),
            }),
        },
    ),
)
