import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocContent } from '@/components/doc-content'
import { DocsShell } from '@/components/docs-shell'
import { getDocNeighbors, getDocPage, listDocPages } from '@/lib/docs'
import { ArrowLeft, ArrowRight } from 'lucide-react'

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
    <main className="docs-container min-h-screen">
      <DocsShell
        pages={pages}
        activeSlug={page.slug}
        title={page.title}
        description={page.summary}
        sections={sectionAnchors}
      >
        <DocContent page={page} />

        {/* Prev/Next Navigation */}
        <div className="mt-10 grid gap-4 border-t border-[var(--border-default)] pt-8 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/docs/${previous.slug}`}
              className="group flex items-center gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-4 transition-all hover:border-indigo-500/30 hover:bg-[var(--bg-elevated)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] transition-colors group-hover:bg-indigo-500/10">
                <ArrowLeft className="h-5 w-5 text-[var(--text-tertiary)] transition-colors group-hover:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-tertiary)]">Previous</p>
                <p className="truncate font-medium text-white transition-colors group-hover:text-indigo-400">
                  {previous.title}
                </p>
              </div>
            </Link>
          ) : (
            <div />
          )}

          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex items-center justify-end gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-4 text-right transition-all hover:border-indigo-500/30 hover:bg-[var(--bg-elevated)]"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-tertiary)]">Next</p>
                <p className="truncate font-medium text-white transition-colors group-hover:text-indigo-400">
                  {next.title}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] transition-colors group-hover:bg-indigo-500/10">
                <ArrowRight className="h-5 w-5 text-[var(--text-tertiary)] transition-colors group-hover:text-indigo-400" />
              </div>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </DocsShell>
    </main>
  )
}
