import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'

export default function NotFound() {
    return (
        <>
            <SiteHeader />
            <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 md:px-8">
                <section className="panel rounded-2xl p-8 text-center">
                    <p className="chip inline-block">404</p>
                    <h1 className="mt-4 text-3xl font-semibold text-[var(--color-ink)]">
                        Page not found
                    </h1>
                    <p className="mt-2 text-[var(--color-muted)]">
                        The route you requested does not exist or has moved.
                    </p>
                    <div className="mt-6 flex justify-center gap-3">
                        <Link
                            href="/"
                            className="rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
                        >
                            Home
                        </Link>
                        <Link
                            href="/docs"
                            className="rounded-xl bg-[var(--color-ink)] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Open docs
                        </Link>
                    </div>
                </section>
            </main>
        </>
    )
}
