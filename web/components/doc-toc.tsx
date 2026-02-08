'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DocSectionAnchor } from '@/components/docs-shell'
import { ArrowUp } from 'lucide-react'

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
            const article = document.querySelector('article')
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
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto">
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-5">
                    {/* Progress */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                            Progress
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-[width] duration-300"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                            {Math.round(progress * 100)}% completed
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="my-5 h-px bg-[var(--border-default)]" />

                    {/* TOC */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                            On this page
                        </p>
                        <nav className="mt-3 space-y-1">
                            {sections.map((section) => {
                                const isActive = section.id === activeId
                                return (
                                    <a
                                        key={section.id}
                                        href={`#${section.id}`}
                                        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all ${
                                            isActive
                                                ? 'bg-indigo-500/10 text-indigo-400'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white'
                                        }`}
                                    >
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full transition-colors ${
                                                isActive
                                                    ? 'bg-indigo-400'
                                                    : 'bg-[var(--text-tertiary)] group-hover:bg-white'
                                            }`}
                                        />
                                        {section.title}
                                    </a>
                                )
                            })}
                        </nav>
                    </div>

                    {/* Back to top */}
                    <div className="mt-5 border-t border-[var(--border-default)] pt-5">
                        <a
                            href="#"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)] transition-colors hover:text-white"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                            Back to top
                        </a>
                    </div>
                </div>
            </div>
        </aside>
    )
}
