'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DocSectionAnchor } from '@/components/docs-shell'
import { ArrowUp } from 'lucide-react'
import { useT } from './intl-provider'

type DocTocProps = {
    sections: DocSectionAnchor[]
    lang?: string
}

export function DocToc({ sections }: DocTocProps) {
    const t = useT()
    const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
    const sectionIds = useMemo(() => sections.map((section) => section.id), [sections])

    useEffect(() => {
        if (!sectionIds.length) return

        const elements = sectionIds
            .map((id) => document.getElementById(id))
            .filter((element): element is HTMLElement => Boolean(element))

        if (!elements.length) return

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (a, b) =>
                            b.intersectionRatio - a.intersectionRatio ||
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    )

                if (visible[0]?.target?.id) {
                    setActiveId(visible[0].target.id)
                }
            },
            {
                rootMargin: '-24% 0px -62% 0px',
                threshold: [0.1, 0.35, 0.6, 1],
            },
        )

        for (const element of elements) {
            observer.observe(element)
        }

        return () => observer.disconnect()
    }, [sectionIds])

    return (
        <aside className="hidden xl:block">
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto">
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                        {t('docs.onThisPage')}
                    </p>
                    <nav className="space-y-1">
                        {sections.map((section) => {
                            const isActive = section.id === activeId
                            return (
                                <a
                                    key={section.id}
                                    href={`#${section.id}`}
                                    className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                                        isActive
                                            ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    {section.title}
                                </a>
                            )
                        })}
                    </nav>
                    <div className="mt-4 border-t border-[var(--border-default)] pt-3">
                        <a
                            href="#"
                            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                            {t('blog.breadcrumb.home')}
                        </a>
                    </div>
                </div>
            </div>
        </aside>
    )
}
