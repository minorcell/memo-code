import Image from 'next/image'
import { Github, Package } from 'lucide-react'
import Link from 'next/link'

const navItems = [{ href: '/docs', label: 'Docs' }]
const GITHUB_URL = 'https://github.com/minorcell/memo-cli'
const NPM_URL = 'https://www.npmjs.com/package/@memo-code/memo'
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const logoPath = `${basePath}/logo.svg`

export function SiteHeader() {
    return (
        <header className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8">
            <div className="panel flex items-center justify-between rounded-2xl px-4 py-3 md:px-5">
                <Link href="/" className="flex items-center gap-3">
                    <Image
                        src={logoPath}
                        width={36}
                        height={36}
                        alt="Memo Logo"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-[var(--color-surface-strong)] object-contain"
                        priority
                    />
                    <div>
                        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--color-ink)]">
                            MEMO CODE
                        </p>
                        <p className="-mt-1 text-xs text-[var(--color-muted)]">
                            Lightweight Coding Agent for Terminal
                        </p>
                    </div>
                </Link>

                <nav className="flex items-center gap-2 text-sm font-medium">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="rounded-lg px-3 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                        >
                            {item.label}
                        </Link>
                    ))}
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub"
                        title="GitHub"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-[var(--color-surface-strong)] text-[var(--color-ink)] transition-transform hover:-translate-y-0.5"
                    >
                        <Github className="h-4 w-4" aria-hidden />
                    </a>
                    <a
                        href={NPM_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="NPM Package"
                        title="NPM Package"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-[var(--color-surface-strong)] text-[var(--color-ink)] transition-transform hover:-translate-y-0.5"
                    >
                        <Package className="h-4 w-4" aria-hidden />
                    </a>
                </nav>
            </div>
        </header>
    )
}
