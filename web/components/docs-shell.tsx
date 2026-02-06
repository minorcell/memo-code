import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DocPageSummary } from '@/lib/docs'
import { DocToc } from '@/components/doc-toc'

const CATEGORY_ORDER = ['Basics', 'Capabilities', 'Operations'] as const

export type DocSectionAnchor = {
    id: string
    title: string
}

type DocsShellProps = {
    pages: DocPageSummary[]
    activeSlug?: string
    title: string
    description?: string
    sections?: DocSectionAnchor[]
    children: ReactNode
}

export function DocsShell({
    pages,
    activeSlug,
    title,
    description,
    sections,
    children,
}: DocsShellProps) {
    const activePage = pages.find((page) => page.slug === activeSlug)
    const hasSectionToc = Boolean(sections?.length)

    const groupedPages = CATEGORY_ORDER.map((category) => ({
        category,
        pages: pages.filter((page) => page.category === category),
    })).filter((group) => group.pages.length > 0)

    const layoutClassName = hasSectionToc
        ? 'lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_230px]'
        : 'lg:grid-cols-[250px_minmax(0,1fr)]'

    return (
        <div className="mx-auto w-full max-w-[1380px] px-4 pb-24 pt-8 md:px-8">
            <details className="docs-mobile-nav panel rounded-xl p-3 lg:hidden">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--color-ink)]">
                    Documentation{activePage ? `: ${activePage.title}` : ''}
                </summary>
                <div className="mt-3 space-y-2 border-t border-black/10 pt-3">
                    {groupedPages.map((group) => (
                        <div key={group.category}>
                            <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                                {group.category}
                            </p>
                            <div className="space-y-1">
                                {group.pages.map((page) => (
                                    <Link
                                        key={page.slug}
                                        href={`/docs/${page.slug}`}
                                        className={`block rounded-lg px-2 py-1.5 text-sm ${
                                            page.slug === activeSlug
                                                ? 'bg-[var(--color-brand)]/12 text-[var(--color-ink)]'
                                                : 'text-[var(--color-muted)]'
                                        }`}
                                    >
                                        {page.title}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </details>

            <div className={`mt-4 grid gap-6 ${layoutClassName}`}>
                <aside className="panel hidden h-max rounded-2xl p-4 lg:block lg:sticky lg:top-6">
                    <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-[var(--color-muted)]">
                        DOCS
                    </p>
                    <div className="space-y-3">
                        {groupedPages.map((group) => (
                            <section key={group.category}>
                                <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                                    {group.category}
                                </p>
                                <div className="space-y-1">
                                    {group.pages.map((page) => {
                                        const isActive = page.slug === activeSlug
                                        return (
                                            <Link
                                                key={page.slug}
                                                href={`/docs/${page.slug}`}
                                                className={`block rounded-xl px-3 py-2 transition-colors ${
                                                    isActive
                                                        ? 'bg-[var(--color-brand)]/12 text-[var(--color-ink)]'
                                                        : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-ink)]'
                                                }`}
                                            >
                                                <p className="text-sm font-semibold">
                                                    {page.title}
                                                </p>
                                                <p className="mt-0.5 line-clamp-2 text-xs opacity-85">
                                                    {page.summary}
                                                </p>
                                            </Link>
                                        )
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </aside>

                <section id="doc-top" className="panel rounded-2xl px-5 py-6 md:px-8 md:py-8">
                    <div className="mb-8 border-b border-black/10 pb-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="chip inline-block">Docs</p>
                            {sections?.length ? (
                                <p className="chip inline-block">{sections.length} sections</p>
                            ) : null}
                        </div>
                        {activePage ? (
                            <p className="mt-3 text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                {activePage.category}
                            </p>
                        ) : null}
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
                            {title}
                        </h1>
                        {description ? (
                            <p className="mt-2 max-w-3xl text-[var(--color-muted)]">
                                {description}
                            </p>
                        ) : null}
                        {sections?.length ? (
                            <div className="mt-5 xl:hidden">
                                <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                                    On this page
                                </p>
                                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                    {sections.map((section) => (
                                        <a
                                            key={section.id}
                                            href={`#${section.id}`}
                                            className="shrink-0 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                                        >
                                            {section.title}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className={hasSectionToc ? 'mx-auto w-full max-w-3xl' : 'w-full'}>
                        {children}
                    </div>
                </section>

                {sections?.length ? <DocToc sections={sections} /> : null}
            </div>
        </div>
    )
}
