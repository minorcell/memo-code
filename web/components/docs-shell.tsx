import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DocPageSummary } from '@/lib/docs'
import { DocToc } from '@/components/doc-toc'
import { BookOpen, ChevronRight, Home } from 'lucide-react'

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
        ? 'lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_260px]'
        : 'lg:grid-cols-[280px_minmax(0,1fr)]'

    return (
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 md:px-8">
            {/* Breadcrumb */}
            <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                <Link
                    href="/"
                    className="flex items-center gap-1 transition-colors hover:text-white"
                >
                    <Home className="h-4 w-4" />
                    <span className="hidden sm:inline">Home</span>
                </Link>
                <ChevronRight className="h-4 w-4" />
                <Link
                    href="/docs"
                    className="flex items-center gap-1 transition-colors hover:text-white"
                >
                    <BookOpen className="h-4 w-4" />
                    <span>Docs</span>
                </Link>
                {activePage && (
                    <>
                        <ChevronRight className="h-4 w-4" />
                        <span className="text-white">{activePage.title}</span>
                    </>
                )}
            </nav>

            {/* Mobile Navigation */}
            <details className="group mb-4 lg:hidden">
                <summary className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 text-sm font-medium text-white">
                    <span className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-[var(--text-tertiary)]" />
                        {activePage ? activePage.title : 'Documentation'}
                    </span>
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-2 space-y-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-2">
                    {groupedPages.map((group) => (
                        <div key={group.category} className="py-2">
                            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                {group.category}
                            </p>
                            <div className="space-y-1">
                                {group.pages.map((page) => (
                                    <Link
                                        key={page.slug}
                                        href={`/docs/${page.slug}`}
                                        className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                                            page.slug === activeSlug
                                                ? 'bg-indigo-500/10 text-indigo-400'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white'
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

            {/* Main Layout */}
            <div className={`grid gap-8 ${layoutClassName}`}>
                {/* Sidebar Navigation */}
                <aside className="hidden lg:block">
                    <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-auto pr-2">
                        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-5">
                            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                <BookOpen className="h-4 w-4" />
                                Documentation
                            </p>
                            <div className="space-y-6">
                                {groupedPages.map((group) => (
                                    <div key={group.category}>
                                        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                            {group.category}
                                        </p>
                                        <div className="space-y-1">
                                            {group.pages.map((page) => {
                                                const isActive = page.slug === activeSlug
                                                return (
                                                    <Link
                                                        key={page.slug}
                                                        href={`/docs/${page.slug}`}
                                                        className={`group flex flex-col rounded-xl px-3 py-2.5 transition-all ${
                                                            isActive
                                                                ? 'bg-indigo-500/10 text-indigo-400'
                                                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-white'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`text-sm font-medium ${isActive ? 'text-indigo-400' : ''}`}
                                                        >
                                                            {page.title}
                                                        </span>
                                                        <span
                                                            className={`mt-0.5 line-clamp-2 text-xs ${
                                                                isActive
                                                                    ? 'text-indigo-400/70'
                                                                    : 'text-[var(--text-tertiary)]'
                                                            }`}
                                                        >
                                                            {page.summary}
                                                        </span>
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

                {/* Main Content */}
                <section className="min-w-0">
                    <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-8 md:px-10 md:py-10">
                        {/* Page Header */}
                        <div className="mb-8 border-b border-[var(--border-default)] pb-8">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400">
                                    Documentation
                                </span>
                                {activePage && (
                                    <span className="text-xs text-[var(--text-tertiary)]">
                                        {activePage.category}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                                {title}
                            </h1>
                            {description && (
                                <p className="mt-3 text-lg text-[var(--text-secondary)]">
                                    {description}
                                </p>
                            )}

                            {/* Mobile TOC */}
                            {sections?.length ? (
                                <div className="mt-6 xl:hidden">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                        On this page
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {sections.map((section) => (
                                            <a
                                                key={section.id}
                                                href={`#${section.id}`}
                                                className="rounded-full border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-white"
                                            >
                                                {section.title}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Content */}
                        <div className="doc-prose">{children}</div>
                    </article>

                    {/* Page Navigation */}
                    {activePage && (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <Link
                                href="/docs"
                                className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4 transition-all hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]"
                            >
                                <ChevronRight className="h-4 w-4 rotate-180 text-[var(--text-tertiary)]" />
                                <div>
                                    <p className="text-xs text-[var(--text-tertiary)]">Back to</p>
                                    <p className="text-sm font-medium text-white">
                                        All Documentation
                                    </p>
                                </div>
                            </Link>
                        </div>
                    )}
                </section>

                {/* Table of Contents - Desktop */}
                {sections?.length ? <DocToc sections={sections} /> : null}
            </div>
        </div>
    )
}
