import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Home, BookOpen, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-16 md:px-8">
        <div className="text-center">
          {/* Error Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20">
            <AlertTriangle className="h-10 w-10 text-indigo-400" />
          </div>

          {/* Error Code */}
          <p className="mt-6 text-sm font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            Error 404
          </p>

          {/* Title */}
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Page not found
          </h1>

          {/* Description */}
          <p className="mx-auto mt-4 max-w-md text-[var(--text-secondary)]">
            The page you&apos;re looking for doesn&apos;t exist or has been moved to a different
            URL.
          </p>

          {/* Actions */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/" className="btn-primary min-w-[160px]">
              <Home className="mr-2 h-4 w-4" />
              Back Home
            </Link>
            <Link href="/docs" className="btn-secondary min-w-[160px]">
              <BookOpen className="mr-2 h-4 w-4" />
              Documentation
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
