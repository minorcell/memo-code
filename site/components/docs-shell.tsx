import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DocPageSummary } from '@/lib/docs'
import { DocToc } from '@/components/doc-toc'
import { ChevronRight } from 'lucide-react'

const CATEGORY_ORDER = ['Getting Started', 'Core Features', 'Extensions', 'Operations'] as const

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
        ? 'lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_220px]'
        : 'lg:grid-cols-[250px_minmax(0,1fr)]'

    return (
        <div className="mx-auto w-full max-w-[1300px] px-4 pb-20 pt-6 md:px-8">
            <nav className="mb-6 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <Link href="/" className="transition-colors hover:text-[var(--text-primary)]">
                    Home
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href="/docs" className="transition-colors hover:text-[var(--text-primary)]">
                    Docs
                </Link>
                {activePage ? (
                    <>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="text-[var(--text-primary)]">{activePage.title}</span>
                    </>
                ) : null}
            </nav>

            <details className="group mb-4 lg:hidden">
                <summary className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]">
                    <span>{activePage ? activePage.title : 'Documentation'}</span>
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-2 space-y-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-2">
                    {groupedPages.map((group) => (
                        <div key={group.category}>
                            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                {group.category}
                            </p>
                            <div className="space-y-1">
                                {group.pages.map((page) => (
                                    <Link
                                        key={page.slug}
                                        href={`/docs/${page.slug}`}
                                        className={`block rounded-md px-2.5 py-2 text-sm transition-colors ${
                                            page.slug === activeSlug
                                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
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

            <div className={`grid gap-6 ${layoutClassName}`}>
                <aside className="hidden lg:block">
                    <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto pr-1">
                        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
                            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                Documentation
                            </p>
                            <div className="space-y-4">
                                {groupedPages.map((group) => (
                                    <div key={group.category}>
                                        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                            {group.category}
                                        </p>
                                        <div className="space-y-1">
                                            {group.pages.map((page) => {
                                                const isActive = page.slug === activeSlug
                                                return (
                                                    <Link
                                                        key={page.slug}
                                                        href={`/docs/${page.slug}`}
                                                        className={`block rounded-md px-2.5 py-2 transition-colors ${
                                                            isActive
                                                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                                        }`}
                                                    >
                                                        <p className="text-sm font-medium">
                                                            {page.title}
                                                        </p>
                                                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-tertiary)]">
                                                            {page.summary}
                                                        </p>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>

                <section className="min-w-0">
                    <article className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-7 md:px-8 md:py-8">
                        <div className="mb-8 border-b border-[var(--border-default)] pb-6">
                            {activePage ? (
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                    {activePage.category}
                                </p>
                            ) : null}
                            <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
                                {title}
                            </h1>
                            {description ? (
                                <p className="mt-3 max-w-3xl text-base text-[var(--text-secondary)]">
                                    {description}
                                </p>
                            ) : null}

                            {sections?.length ? (
                                <div className="mt-5 xl:hidden">
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                        On this page
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {sections.map((section) => (
                                            <a
                                                key={section.id}
                                                href={`#${section.id}`}
                                                className="rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                                            >
                                                {section.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="doc-prose">{children}</div>
                    </article>

                    {activePage ? (
                        <div className="mt-4">
                            <Link
                                href="/docs"
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                                <ChevronRight className="h-4 w-4 rotate-180" />
                                All Documentation
                            </Link>
                        </div>
                    ) : null}
                </section>

                {sections?.length ? <DocToc sections={sections} /> : null}
            </div>
        </div>
    )
}
