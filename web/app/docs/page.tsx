import Link from 'next/link'
import { DocsShell } from '@/components/docs-shell'
import { getDocsHome, listDocPages } from '@/lib/docs'

const CATEGORY_ORDER = ['Basics', 'Capabilities', 'Operations'] as const

export default async function DocsIndexPage() {
    const [pages, docsHome] = await Promise.all([listDocPages(), getDocsHome()])
    const recommended = pages.filter((page) =>
        ['getting-started', 'cli-tui', 'configuration'].includes(page.slug),
    )

    return (
        <main>
            <DocsShell
                pages={pages}
                title="Memo Docs"
                description="Documentation sourced directly from /docs/user. Covers setup, usage, configuration, and troubleshooting."
            >
                <section>
                    <p className="text-xs font-semibold tracking-[0.1em] text-[var(--color-muted)]">
                        Recommended reading path
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {recommended.map((page, index) => (
                            <Link
                                key={page.slug}
                                href={`/docs/${page.slug}`}
                                className="rounded-xl border border-black/10 bg-white/75 p-4 transition-transform hover:-translate-y-0.5"
                            >
                                <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                    Step {index + 1}
                                </p>
                                <h2 className="mt-1 text-base font-semibold text-[var(--color-ink)]">
                                    {page.title}
                                </h2>
                                <p className="mt-1 text-sm text-[var(--color-muted)]">
                                    {page.summary}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>

                <section
                    className="doc-prose mt-7 rounded-xl border border-black/10 bg-white/65 p-5 md:p-6"
                    dangerouslySetInnerHTML={{ __html: docsHome.html }}
                />

                <div className="mt-7 space-y-6">
                    {CATEGORY_ORDER.map((category) => {
                        const sectionPages = pages.filter((page) => page.category === category)
                        if (!sectionPages.length) {
                            return null
                        }
                        return (
                            <section key={category}>
                                <h3 className="text-lg font-semibold text-[var(--color-ink)]">
                                    {category}
                                </h3>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    {sectionPages.map((page) => (
                                        <Link
                                            key={page.slug}
                                            href={`/docs/${page.slug}`}
                                            className="rounded-xl border border-black/10 bg-white/70 p-4 transition-transform hover:-translate-y-0.5"
                                        >
                                            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                                {page.category}
                                            </p>
                                            <h2 className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
                                                {page.title}
                                            </h2>
                                            <p className="mt-1 text-sm text-[var(--color-muted)]">
                                                {page.summary}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </div>
            </DocsShell>
        </main>
    )
}
