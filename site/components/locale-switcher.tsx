'use client'

import { useState } from 'react'
import { Globe, Check } from 'lucide-react'
import { locales, type Locale, localeLabels } from '@/lib/i18n/config'
import { useT } from './intl-provider'

type LocaleSwitcherProps = {
    lang: string
}

export function LocaleSwitcher({ lang: currentLocale }: LocaleSwitcherProps) {
    const t = useT('localeSwitcher')
    const [isOpen, setIsOpen] = useState(false)

    const handleLocaleChange = (newLocale: Locale) => {
        if (newLocale !== currentLocale) {
            const currentPath = window.location.pathname
            const newPath = currentPath.replace(`/${currentLocale}`, `/${newLocale}`)
            window.location.href = newPath
        }
        setIsOpen(false)
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                aria-label={t('label')}
                title={t('label')}
            >
                <Globe className="h-4 w-4" />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] py-1 shadow-lg">
                        {locales.map((l) => (
                            <button
                                key={l}
                                onClick={() => handleLocaleChange(l)}
                                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                                    l === currentLocale
                                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                                <span>{localeLabels[l]}</span>
                                {l === currentLocale && <Check className="h-3.5 w-3.5" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
