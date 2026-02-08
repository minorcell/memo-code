import Link from 'next/link'
import { DocsShell } from '@/components/docs-shell'
import { listDocPages } from '@/lib/docs'
import {
    ArrowRight,
    BookOpen,
    Zap,
    Sparkles,
    Terminal,
    ExternalLink,
    Puzzle,
    Settings,
} from 'lucide-react'

const quickStartGuides = [
    {
        slug: 'getting-started',
        title: 'Getting Started',
        description: 'Installation and basic setup',
        icon: Terminal,
    },
    {
        slug: 'cli-tui',
        title: 'CLI & TUI',
        description: 'Interactive terminal interface',
        icon: Zap,
    },
    {
        slug: 'configuration',
        title: 'Configuration',
        description: 'API keys and settings',
        icon: BookOpen,
    },
]

const categoryConfig: Record<string, { title: string; icon: typeof BookOpen }> = {
    'Getting Started': { title: 'Getting Started', icon: Terminal },
    'Core Features': { title: 'Core Features', icon: Zap },
    Extensions: { title: 'Extensions', icon: Puzzle },
    Operations: { title: 'Operations', icon: Settings },
}

export default async function DocsIndexPage() {
    const pages = await listDocPages()

    // Group pages by category
    const grouped = {
        'Getting Started': pages.filter((p) => p.category === 'Getting Started'),
        'Core Features': pages.filter((p) => p.category === 'Core Features'),
        Extensions: pages.filter((p) => p.category === 'Extensions'),
        Operations: pages.filter((p) => p.category === 'Operations'),
    }

    return (
        <main className="docs-container min-h-screen">
            <DocsShell
                pages={pages}
                title="Documentation"
                description="Learn how to install, configure, and use Memo CLI to boost your development workflow."
            >
                {/* Quick Start Section */}
                <section className="mb-12">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
                            <Zap className="h-4 w-4 text-indigo-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Quick Start</h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {quickStartGuides.map((guide, index) => (
                            <Link
                                key={guide.slug}
                                href={`/docs/${guide.slug}`}
                                className="group relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-5 transition-all hover:border-indigo-500/30"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                                <div className="relative">
                                    <div className="flex items-center justify-between">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-secondary)] font-mono text-sm text-indigo-400">
                                            0{index + 1}
                                        </span>
                                        <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-1" />
                                    </div>
                                    <h3 className="mt-4 font-medium text-white">{guide.title}</h3>
                                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                        {guide.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* All Docs Grid */}
                <section className="mb-12">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
                            <BookOpen className="h-4 w-4 text-indigo-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">All Guides</h2>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(grouped).map(([category, categoryPages]) => {
                            const config = categoryConfig[category]
                            const Icon = config?.icon || BookOpen
                            return (
                                <div
                                    key={category}
                                    className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-5"
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                            {config?.title || category}
                                        </h3>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {categoryPages.map((page) => (
                                            <Link
                                                key={page.slug}
                                                href={`/docs/${page.slug}`}
                                                className="group block rounded-lg p-2 transition-colors hover:bg-[var(--bg-secondary)]"
                                            >
                                                <p className="font-medium text-white transition-colors group-hover:text-indigo-400">
                                                    {page.title}
                                                </p>
                                                <p className="text-sm text-[var(--text-secondary)] line-clamp-1">
                                                    {page.summary}
                                                </p>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* Help Section */}
                <section>
                    <div className="rounded-xl border border-[var(--border-default)] bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
                                <Sparkles className="h-5 w-5 text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-white">Need help?</h3>
                                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                    Can&apos;t find what you&apos;re looking for? Check our
                                    troubleshooting guide or open an issue on GitHub.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Link
                                        href="/docs/troubleshooting"
                                        className="btn-secondary text-sm"
                                    >
                                        Troubleshooting
                                    </Link>
                                    <a
                                        href="https://github.com/minorcell/memo-cli/issues"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                                    >
                                        Open an issue
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </DocsShell>
        </main>
    )
}
