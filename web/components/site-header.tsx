'use client'

import Image from 'next/image'
import { Github, Package, Menu, X, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const GITHUB_URL = 'https://github.com/minorcell/memo-cli'
const NPM_URL = 'https://www.npmjs.com/package/@memo-code/memo'
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const navItems = [{ href: '/docs', label: 'Docs', icon: BookOpen }]

export function SiteHeader() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <header className="sticky top-0 z-50 px-4 pt-4 md:px-8">
            <div className="mx-auto max-w-6xl">
                <nav className="flex items-center justify-between rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)]/80 px-4 py-3 backdrop-blur-xl">
                    {/* Logo */}
                    <Link href="/" className="group flex items-center gap-3">
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 transition-transform group-hover:scale-105">
                            <Image
                                src={`${basePath}/logo.svg`}
                                width={24}
                                height={24}
                                alt="Memo Logo"
                                className="rounded"
                            />
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-semibold tracking-tight text-white">Memo</p>
                            <p className="-mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                                Coding Agent
                            </p>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden items-center gap-1 md:flex">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-white"
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        ))}
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2">
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="GitHub"
                            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-hover)] hover:text-white sm:flex"
                        >
                            <Github className="h-4 w-4" />
                        </a>
                        <a
                            href={NPM_URL}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="npm"
                            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-hover)] hover:text-white sm:flex"
                        >
                            <Package className="h-4 w-4" />
                        </a>

                        <Link
                            href="/docs/getting-started"
                            className="hidden rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 hover:shadow-lg hover:shadow-indigo-500/25 md:block"
                        >
                            Get Started
                        </Link>

                        {/* Mobile menu button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] md:hidden"
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? (
                                <X className="h-4 w-4" />
                            ) : (
                                <Menu className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </nav>

                {/* Mobile menu */}
                {mobileMenuOpen && (
                    <div className="mt-2 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-2 md:hidden">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-white"
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        ))}
                        <div className="mt-2 border-t border-[var(--border-default)] pt-2">
                            <Link
                                href="/docs/getting-started"
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-medium text-white"
                            >
                                Get Started
                            </Link>
                        </div>
                        <div className="mt-2 flex gap-2 border-t border-[var(--border-default)] pt-2">
                            <a
                                href={GITHUB_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--bg-tertiary)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]"
                            >
                                <Github className="h-4 w-4" />
                                GitHub
                            </a>
                            <a
                                href={NPM_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--bg-tertiary)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]"
                            >
                                <Package className="h-4 w-4" />
                                npm
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
