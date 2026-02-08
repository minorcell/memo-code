import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/site-header'
import { ArrowRight, Zap, Shield, Terminal, Cpu, GitBranch, Sparkles } from 'lucide-react'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

// Feature data with icons
const features = [
    {
        icon: Terminal,
        title: 'Terminal-Native',
        description:
            'Runs in your terminal, seamlessly integrated with your existing development workflow without context switching.',
    },
    {
        icon: Zap,
        title: 'Lightning Fast',
        description:
            'Built on an efficient architecture for rapid responses and a buttery-smooth coding agent experience.',
    },
    {
        icon: Cpu,
        title: 'Built-in Tools',
        description:
            'File operations, code search, command execution, and more — ready to use right out of the box.',
    },
    {
        icon: Shield,
        title: 'Safety First',
        description:
            'Critical operations require confirmation, giving you full control while enjoying automation.',
    },
    {
        icon: GitBranch,
        title: 'MCP Ready',
        description:
            'Supports Model Context Protocol to connect external tools and extend capabilities.',
    },
    {
        icon: Sparkles,
        title: 'Multi-Agent',
        description:
            'Subagent mode enables multi-agent collaboration for handling complex tasks with ease.',
    },
]

// Workflow steps
const workflowSteps = [
    {
        step: '01',
        title: 'Install',
        code: 'npm install -g @memo-code/memo',
        description: 'Install globally and get started instantly',
    },
    {
        step: '02',
        title: 'Configure',
        code: 'export OPENAI_API_KEY=sk-...',
        description: 'Set your API key, supports multiple models',
    },
    {
        step: '03',
        title: 'Launch',
        code: 'memo',
        description: 'Start the interactive TUI interface',
    },
]

export default function Home() {
    return (
        <div className="relative min-h-screen">
            <SiteHeader />

            <main className="relative z-10">
                {/* Hero Section */}
                <section className="relative overflow-hidden px-4 pb-24 pt-16 md:px-8 md:pb-32 md:pt-24">
                    <div className="mx-auto max-w-6xl">
                        {/* Badge */}
                        <div className="flex justify-center">
                            <div className="badge badge-accent animate-fade-in-up">
                                <Sparkles className="mr-1.5 h-3 w-3" />
                                Now available on npm
                            </div>
                        </div>

                        {/* Main headline */}
                        <h1 className="animate-fade-in-up stagger-1 mt-8 text-center text-4xl font-semibold tracking-tight text-white md:text-6xl lg:text-7xl">
                            Your coding agent,
                            <br />
                            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                                in the terminal
                            </span>
                        </h1>

                        {/* Subtitle */}
                        <p className="animate-fade-in-up stagger-2 mx-auto mt-6 max-w-2xl text-center text-lg text-[var(--text-secondary)]">
                            Memo is a lightweight, open-source coding agent that understands your
                            project context and helps you code faster through natural language.
                        </p>

                        {/* CTA Buttons */}
                        <div className="animate-fade-in-up stagger-3 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link
                                href="/docs/getting-started"
                                className="btn-primary min-w-[160px]"
                            >
                                Get Started
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                            <a
                                href="https://github.com/minorcell/memo-cli"
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary min-w-[160px]"
                            >
                                View on GitHub
                            </a>
                        </div>

                        {/* Hero Terminal Preview */}
                        <div className="animate-fade-in-up stagger-4 mt-16">
                            <div className="card-gradient mx-auto max-w-4xl overflow-hidden">
                                <div className="flex items-center gap-2 border-b border-[var(--border-default)] bg-[#0d0d12] px-4 py-3">
                                    <div className="flex gap-1.5">
                                        <div className="h-3 w-3 rounded-full bg-red-500/80" />
                                        <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                                        <div className="h-3 w-3 rounded-full bg-green-500/80" />
                                    </div>
                                    <div className="ml-4 flex-1 text-center">
                                        <span className="text-xs text-[var(--text-tertiary)]">
                                            memo
                                        </span>
                                    </div>
                                    <div className="w-16" />
                                </div>
                                <div className="bg-[#0d0d12] p-6 font-mono text-sm">
                                    <div className="flex items-start gap-2">
                                        <span className="text-green-400">➜</span>
                                        <span className="text-blue-400">~/project</span>
                                        <span className="text-[var(--text-secondary)]">memo</span>
                                    </div>
                                    <div className="mt-4 space-y-2 text-[var(--text-secondary)]">
                                        <p>✓ Loaded project context</p>
                                        <p>✓ Connected to OpenAI</p>
                                        <p className="text-[var(--text-primary)]">
                                            How can I help you today?{' '}
                                            <span className="animate-pulse text-[var(--accent-primary)]">
                                                ▋
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Grid */}
                <section className="border-y border-[var(--border-default)] bg-[var(--bg-secondary)]/30 px-4 py-24 md:px-8 md:py-32">
                    <div className="mx-auto max-w-6xl">
                        <div className="text-center">
                            <div className="badge mx-auto">Features</div>
                            <h2 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
                                Everything you need
                            </h2>
                            <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">
                                A complete toolkit for AI-assisted development, right in your
                                terminal
                            </p>
                        </div>

                        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {features.map((feature, index) => (
                                <div
                                    key={feature.title}
                                    className="card-gradient group p-6 transition-all duration-300 hover:scale-[1.02]"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 transition-colors group-hover:from-indigo-500/30 group-hover:to-purple-500/30">
                                        <feature.icon className="h-6 w-6" />
                                    </div>
                                    <h3 className="mt-4 text-lg font-semibold text-white">
                                        {feature.title}
                                    </h3>
                                    <p className="mt-2 text-[var(--text-secondary)]">
                                        {feature.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Workflow Section */}
                <section className="relative overflow-hidden px-4 py-24 md:px-8 md:py-32">
                    <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-secondary)] via-transparent to-[var(--bg-secondary)] opacity-50" />
                    <div className="relative mx-auto max-w-6xl">
                        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
                            <div>
                                <div className="badge">Quick Start</div>
                                <h2 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
                                    Up and running in seconds
                                </h2>
                                <p className="mt-4 text-[var(--text-secondary)]">
                                    No complex setup required. Install, configure, and start coding
                                    with AI assistance in under a minute.
                                </p>

                                <div className="mt-8 space-y-6">
                                    {workflowSteps.map((item) => (
                                        <div key={item.step} className="flex gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-tertiary)] text-sm font-bold text-indigo-400">
                                                {item.step}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">
                                                    {item.title}
                                                </h3>
                                                <p className="text-sm text-[var(--text-tertiary)]">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-2xl" />
                                <div className="card-gradient relative overflow-hidden">
                                    <div className="border-b border-[var(--border-default)] bg-[#0d0d12] px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full bg-green-500/80" />
                                            <span className="text-xs text-[var(--text-tertiary)]">
                                                install.sh
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-[#0d0d12] p-6 font-mono text-sm">
                                        <div className="space-y-4">
                                            {workflowSteps.map((item) => (
                                                <div key={item.step}>
                                                    <p className="text-[var(--text-tertiary)]">
                                                        # {item.title}
                                                    </p>
                                                    <p className="text-[var(--text-primary)]">
                                                        <span className="text-green-400">$</span>{' '}
                                                        {item.code}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="border-t border-[var(--border-default)] px-4 py-24 md:px-8 md:py-32">
                    <div className="mx-auto max-w-4xl">
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 p-8 md:p-12">
                            <div className="absolute inset-0 bg-[var(--bg-secondary)]" />
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10" />
                            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
                            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />

                            <div className="relative text-center">
                                <h2 className="text-3xl font-semibold text-white md:text-4xl">
                                    Ready to get started?
                                </h2>
                                <p className="mx-auto mt-4 max-w-lg text-[var(--text-secondary)]">
                                    Install Memo CLI and start coding with AI assistance today.
                                </p>
                                <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                                    <Link
                                        href="/docs/getting-started"
                                        className="btn-primary min-w-[180px]"
                                    >
                                        Read Documentation
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                    <a
                                        href="https://www.npmjs.com/package/@memo-code/memo"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn-secondary min-w-[180px]"
                                    >
                                        npm install
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="border-t border-[var(--border-default)] px-4 py-12 md:px-8">
                    <div className="mx-auto max-w-6xl">
                        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
                            <div className="flex items-center gap-3">
                                <Image
                                    src={`${basePath}/logo.svg`}
                                    width={32}
                                    height={32}
                                    alt="Memo Logo"
                                    className="rounded-lg"
                                />
                                <span className="font-semibold text-white">Memo CLI</span>
                            </div>
                            <div className="flex gap-8 text-sm text-[var(--text-secondary)]">
                                <Link href="/docs" className="transition-colors hover:text-white">
                                    Documentation
                                </Link>
                                <a
                                    href="https://github.com/minorcell/memo-cli"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="transition-colors hover:text-white"
                                >
                                    GitHub
                                </a>
                                <a
                                    href="https://www.npmjs.com/package/@memo-code/memo"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="transition-colors hover:text-white"
                                >
                                    npm
                                </a>
                            </div>
                            <p className="text-sm text-[var(--text-tertiary)]">
                                © 2025 Memo CLI. Open source under MIT.
                            </p>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    )
}
