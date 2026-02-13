import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
    title: {
        default: 'Blog',
        template: '%s | Memo CLI Blog',
    },
    description: 'Engineering notes and implementation write-ups for Memo CLI.',
}

export default function BlogLayout({ children }: { children: ReactNode }) {
    return (
        <div className="docs-container min-h-screen">
            <SiteHeader />
            {children}
        </div>
    )
}
