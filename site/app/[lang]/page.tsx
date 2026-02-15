import { HomeClient } from './home-client'
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

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params
    const messages = messagesByLocale[lang] || messagesByLocale.en

    return <HomeClient lang={lang} messages={messages} />
}
