'use client'

import type { PropsWithChildren } from 'react'
import { createContext, useContext, useMemo } from 'react'
import type enMessages from '@/lib/i18n/messages/en.json'

type IntlProviderProps = PropsWithChildren<{
    locale: string
    messages: typeof enMessages
}>

type TranslationValues = Record<string, string | number>

type IntlContextValue = {
    locale: string
    messages: typeof enMessages
}

const IntlContext = createContext<IntlContextValue | null>(null)

function resolveMessage(messages: Record<string, unknown>, key: string): unknown {
    const segments = key.split('.')
    let value: unknown = messages
    for (const segment of segments) {
        value = (value as Record<string, unknown> | undefined)?.[segment]
    }
    return value
}

function interpolate(message: string, values?: TranslationValues): string {
    if (!values) return message
    return message.replace(/\{(\w+)\}/g, (_match, token: string) => {
        if (Object.prototype.hasOwnProperty.call(values, token)) {
            return String(values[token])
        }
        return `{${token}}`
    })
}

export function IntlProvider({ locale, messages, children }: IntlProviderProps) {
    const contextValue = useMemo(() => ({ locale, messages }), [locale, messages])
    return <IntlContext.Provider value={contextValue}>{children}</IntlContext.Provider>
}

export function useT(namespace?: string) {
    const context = useContext(IntlContext)
    if (!context) {
        throw new Error('useT must be used within <IntlProvider>.')
    }

    return (key: string, values?: TranslationValues): string => {
        const fullKey = namespace ? `${namespace}.${key}` : key
        const raw = resolveMessage(context.messages as Record<string, unknown>, fullKey)
        if (typeof raw !== 'string') {
            return fullKey
        }
        return interpolate(raw, values)
    }
}
