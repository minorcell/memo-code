import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocContent } from '@/components/doc-content'
import { DocsShell } from '@/components/docs-shell'
import { getDocNeighbors, getDocPage, listDocPages } from '@/lib/docs'

type DocDetailPageProps = {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    const pages = await listDocPages()
    return pages.map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: DocDetailPageProps): Promise<Metadata> {
    const { slug } = await params
    const page = await getDocPage(slug)

    if (!page) {
        return {
            title: 'Document Not Found',
        }
    }

    return {
        title: page.title,
        description: page.summary,
    }
}

export default async function DocDetailPage({ params }: DocDetailPageProps) {
    const { slug } = await params
    const [page, pages] = await Promise.all([getDocPage(slug), listDocPages()])

    if (!page) {
        notFound()
    }

    const { previous, next } = await getDocNeighbors(page.slug)
    const sectionAnchors = page.sections.map((section) => ({
        id: section.id,
        title: section.title,
    }))

    return (
        <main>
            <DocsShell
                pages={pages}
                activeSlug={page.slug}
                title={page.title}
                sections={sectionAnchors}
            >
                <DocContent page={page} />

                <div className="mt-10 grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-2">
                    {previous ? (
                        <Link
                            href={`/docs/${previous.slug}`}
                            className="rounded-xl border border-black/10 bg-white/70 p-4"
                        >
                            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                Previous
                            </p>
                            <p className="mt-1 text-base font-semibold text-[var(--color-ink)]">
                                {previous.title}
                            </p>
                        </Link>
                    ) : (
                        <div />
                    )}

                    {next ? (
                        <Link
                            href={`/docs/${next.slug}`}
                            className="rounded-xl border border-black/10 bg-white/70 p-4 text-left sm:text-right"
                        >
                            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                Next
                            </p>
                            <p className="mt-1 text-base font-semibold text-[var(--color-ink)]">
                                {next.title}
                            </p>
                        </Link>
                    ) : (
                        <div />
                    )}
                </div>
            </DocsShell>
        </main>
    )
}
