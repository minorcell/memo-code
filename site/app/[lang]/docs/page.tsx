import { listDocPages } from '@/lib/docs'
import { DocsIndexClient } from './docs-index-client'
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

export default async function DocsIndexPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params
    const pages = await listDocPages(lang)
    const messages = messagesByLocale[lang] || messagesByLocale.en

    return <DocsIndexClient pages={pages} lang={lang} messages={messages} />
}
