import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
    title: {
        default: 'Memo Docs',
        template: '%s | Memo Docs',
    },
    description: 'Official Memo documentation sourced from /docs/user.',
}

export default function DocsLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <SiteHeader />
            {children}
        </>
    )
}
