import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
    title: {
        default: 'Documentation',
        template: '%s | Memo CLI Docs',
    },
    description:
        'Complete documentation for Memo CLI. Learn how to install, configure, and use the AI coding agent.',
}

export default function DocsLayout({ children }: { children: ReactNode }) {
    return (
        <div className="docs-container min-h-screen">
            <SiteHeader />
            {children}
        </div>
    )
}
