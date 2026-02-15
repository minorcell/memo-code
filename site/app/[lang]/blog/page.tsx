import { listBlogPosts } from '@/lib/blog'
import { BlogIndexClient } from './blog-index-client'
import enMessages from '@/lib/i18n/messages/en.json'
import zhMessages from '@/lib/i18n/messages/zh.json'

const messagesByLocale: Record<string, typeof enMessages> = {
    en: enMessages,
    zh: zhMessages,
}

export async function generateStaticParams() {
    const { locales } = await import('@/lib/i18n/config')
    return locales.map((lang) => ({ lang }))
}

export default async function BlogIndexPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params
    const posts = await listBlogPosts(lang)
    const messages = messagesByLocale[lang] || messagesByLocale.en

    return <BlogIndexClient posts={posts} lang={lang} messages={messages} />
}
