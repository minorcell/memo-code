import Link from 'next/link'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { DocsShell } from '@/components/docs-shell'
import { listDocPages } from '@/lib/docs'

const quickStartGuides = [
    {
        slug: 'getting-started',
        title: 'Getting Started',
        description: 'Installation and basic setup',
    },
    {
        slug: 'cli-tui',
        title: 'CLI & TUI',
        description: 'Interactive terminal interface',
    },
    {
        slug: 'configuration',
        title: 'Configuration',
        description: 'API keys and settings',
    },
]

const categoryOrder = ['Getting Started', 'Core Features', 'Extensions', 'Operations'] as const

export default async function DocsIndexPage() {
    const pages = await listDocPages()

    const grouped = categoryOrder.map((category) => ({
        category,
        pages: pages.filter((page) => page.category === category),
    }))

    return (
        <main className="docs-container min-h-screen">
            <DocsShell
                pages={pages}
                title="Documentation"
                description="Learn how to install, configure, and use Memo CLI."
            >
                <section className="mb-10">
                    <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                        Quick Start
                    </h2>
                    <div className="grid gap-3 md:grid-cols-3">
                        {quickStartGuides.map((guide) => (
                            <Link
                                key={guide.slug}
                                href={`/docs/${guide.slug}`}
                                className="group rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] px-4 py-3 transition-colors hover:bg-[var(--bg-elevated)]"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">
                                        {guide.title}
                                    </p>
                                    <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" />
                                </div>
                                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                    {guide.description}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
                        All Guides
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {grouped.map((group) => (
                            <div
                                key={group.category}
                                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-4"
                            >
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                                    {group.category}
                                </p>
                                <div className="space-y-1.5">
                                    {group.pages.map((page) => (
                                        <Link
                                            key={page.slug}
                                            href={`/docs/${page.slug}`}
                                            className="block rounded-md px-2 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
                                        >
                                            <p className="text-sm font-medium text-[var(--text-primary)]">
                                                {page.title}
                                            </p>
                                            <p className="line-clamp-1 text-xs text-[var(--text-secondary)]">
                                                {page.summary}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-5">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        Need help?
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Check troubleshooting or open an issue if something is unclear.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link href="/docs/troubleshooting" className="btn-secondary text-sm">
                            Troubleshooting
                        </Link>
                        <a
                            href="https://github.com/minorcell/memo-cli/issues"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                            Open an issue
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </section>
            </DocsShell>
        </main>
    )
}
