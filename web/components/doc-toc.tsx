'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DocSectionAnchor } from '@/components/docs-shell'

type DocTocProps = {
    sections: DocSectionAnchor[]
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

export function DocToc({ sections }: DocTocProps) {
    const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
    const [progress, setProgress] = useState(0)

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

    useEffect(() => {
        const updateProgress = () => {
            const article = document.getElementById('doc-article')
            if (!article) {
                setProgress(0)
                return
            }

            const rect = article.getBoundingClientRect()
            const top = window.scrollY + rect.top
            const height = article.offsetHeight
            const viewport = window.innerHeight

            const start = top - viewport * 0.16
            const end = top + height - viewport * 0.72
            const ratio = (window.scrollY - start) / Math.max(end - start, 1)

            setProgress(clamp(ratio, 0, 1))
        }

        updateProgress()
        window.addEventListener('scroll', updateProgress, { passive: true })
        window.addEventListener('resize', updateProgress)

        return () => {
            window.removeEventListener('scroll', updateProgress)
            window.removeEventListener('resize', updateProgress)
        }
    }, [])

    return (
        <aside className="hidden xl:block">
            <div className="panel sticky top-6 rounded-2xl p-4">
                <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                    Reading progress
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                    <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand),var(--color-accent))] transition-[width]"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {Math.round(progress * 100)}%
                </p>

                <p className="mt-5 text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                    On this page
                </p>
                <nav className="mt-2 space-y-1">
                    {sections.map((section) => {
                        const isActive = section.id === activeId
                        return (
                            <a
                                key={section.id}
                                href={`#${section.id}`}
                                className={`block rounded-lg px-2 py-1.5 text-sm transition-colors ${
                                    isActive
                                        ? 'bg-[var(--color-brand)]/12 text-[var(--color-ink)]'
                                        : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-ink)]'
                                }`}
                            >
                                {section.title}
                            </a>
                        )
                    })}
                </nav>

                <a
                    href="#doc-top"
                    className="mt-4 inline-block text-xs font-semibold text-[var(--color-accent)]"
                >
                    Back to top
                </a>
            </div>
        </aside>
    )
}
