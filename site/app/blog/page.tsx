import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listBlogPosts } from '@/lib/blog'

function formatDate(date: string) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    })
}

export default async function BlogIndexPage() {
    const posts = await listBlogPosts()

    return (
        <main className="docs-container min-h-screen">
            <div className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-6 md:px-8">
                <nav className="mb-6 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <Link href="/" className="transition-colors hover:text-[var(--text-primary)]">
                        Home
                    </Link>
                    <span>/</span>
                    <span className="text-[var(--text-primary)]">Blog</span>
                </nav>

                <section className="mb-8 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-7 md:px-8 md:py-8">
                    <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
                        Blog
                    </h1>
                    <p className="mt-3 max-w-3xl text-base text-[var(--text-secondary)]">
                        Memo Code 的工程实践记录与设计说明。
                    </p>
                </section>

                <section className="space-y-4">
                    {posts.map((post) => (
                        <article
                            key={post.slug}
                            className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-6 transition-colors hover:border-[var(--border-hover)]"
                        >
                            <p className="text-xs text-[var(--text-tertiary)]">
                                {formatDate(post.publishedAt)}
                            </p>
                            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                                <Link href={`/blog/${post.slug}`} className="hover:underline">
                                    {post.title}
                                </Link>
                            </h2>
                            <p className="mt-3 text-sm text-[var(--text-secondary)]">
                                {post.summary}
                            </p>
                            <Link
                                href={`/blog/${post.slug}`}
                                className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                                Read article
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </article>
                    ))}
                </section>
            </div>
        </main>
    )
}
