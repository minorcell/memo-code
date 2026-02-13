import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getBlogPost, listBlogPosts } from '@/lib/blog'

type BlogDetailPageProps = {
  params: Promise<{ slug: string }>
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export async function generateStaticParams() {
  const posts = await listBlogPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)

  if (!post) {
    return {
      title: 'Post Not Found',
    }
  }

  return {
    title: post.title,
    description: post.summary,
  }
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { slug } = await params
  const post = await getBlogPost(slug)

  if (!post) {
    notFound()
  }

  return (
    <main className="docs-container min-h-screen">
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-6 md:px-8">
        <nav className="mb-6 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Link href="/" className="transition-colors hover:text-[var(--text-primary)]">
            Home
          </Link>
          <span>/</span>
          <Link href="/blog" className="transition-colors hover:text-[var(--text-primary)]">
            Blog
          </Link>
          <span>/</span>
          <span className="line-clamp-1 text-[var(--text-primary)]">{post.title}</span>
        </nav>

        <article className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-7 md:px-8 md:py-8">
          <header className="mb-8 border-b border-[var(--border-default)] pb-6">
            <p className="text-xs text-[var(--text-tertiary)]">{formatDate(post.publishedAt)}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
              {post.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base text-[var(--text-secondary)]">{post.summary}</p>
          </header>

          <div className="doc-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        </article>

        <div className="mt-4">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Posts
          </Link>
        </div>
      </div>
    </main>
  )
}
