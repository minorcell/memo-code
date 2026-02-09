import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/site-header'
import { MemoHeroRemotion } from '@/components/memo-hero-remotion'
import { MemoArchitectureDiagram } from '@/components/memo-architecture-remotion'
import { ArrowRight, Terminal, Cpu, Shield, GitBranch, Layers, Gauge } from 'lucide-react'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const features = [
    {
        icon: Terminal,
        title: 'Terminal-native',
        description: 'Works where you already ship: directly inside your terminal workflow.',
    },
    {
        icon: Gauge,
        title: 'Fast feedback',
        description: 'Optimized for quick iteration, from reading code to applying changes.',
    },
    {
        icon: Cpu,
        title: 'Built-in tools',
        description: 'File I/O, grep, commands, and patching are available out of the box.',
    },
    {
        icon: Shield,
        title: 'Approval controls',
        description: 'Dangerous operations can require confirmation before execution.',
    },
    {
        icon: GitBranch,
        title: 'MCP ready',
        description: 'Connect external capabilities through the Model Context Protocol.',
    },
    {
        icon: Layers,
        title: 'Multi-agent mode',
        description: 'Delegate subtasks to subagents when work needs to fan out.',
    },
]

const workflowSteps = [
    {
        step: '01',
        title: 'Install',
        code: 'npm install -g @memo-code/memo',
        description: 'Install once and run anywhere.',
    },
    {
        step: '02',
        title: 'Configure',
        code: 'export OPENAI_API_KEY=sk-...',
        description: 'Use OpenAI-compatible or DeepSeek providers.',
    },
    {
        step: '03',
        title: 'Launch',
        code: 'memo',
        description: 'Start the interactive TUI session.',
    },
]

export default function Home() {
    return (
        <div className="relative min-h-screen bg-[var(--bg-primary)]">
            <SiteHeader />

            <main className="relative z-10 pb-16">
                <section className="border-b border-[var(--border-default)] px-4 pb-20 pt-14 md:px-8 md:pb-24 md:pt-20">
                    <div className="mx-auto max-w-6xl">
                        <div className="inline-flex items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                            Open-source terminal coding agent
                        </div>

                        <h1 className="mt-8 max-w-5xl text-4xl font-semibold tracking-tight text-[var(--text-primary)] md:text-6xl">
                            A lightweight coding agent that runs in your terminal.
                        </h1>
                        <p className="mt-5 max-w-3xl text-lg text-[var(--text-secondary)]">
                            Memo understands your project structure, runs tools safely, and helps
                            you move from prompt to patch without leaving the shell.
                        </p>

                        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
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

                        <div className="mt-12 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)]">
                            <MemoHeroRemotion />
                        </div>
                    </div>
                </section>

                <section className="border-b border-[var(--border-default)] px-4 py-16 md:px-8 md:py-20">
                    <div className="mx-auto max-w-6xl">
                        <h2 className="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
                            Built for real engineering workflows
                        </h2>
                        <p className="mt-3 max-w-2xl text-[var(--text-secondary)]">
                            Keep the stack simple: clean output, explicit steps, and tooling that
                            fits daily development.
                        </p>

                        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {features.map((feature) => (
                                <div
                                    key={feature.title}
                                    className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-5"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                                        <feature.icon className="h-4 w-4" />
                                    </div>
                                    <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
                                        {feature.title}
                                    </h3>
                                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                        {feature.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-b border-[var(--border-default)] px-4 py-16 md:px-8 md:py-20">
                    <div className="mx-auto max-w-6xl">
                        <div className="badge">Architecture</div>
                        <h2 className="mt-4 max-w-4xl text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
                            System architecture design
                        </h2>
                        <p className="mt-3 max-w-3xl text-[var(--text-secondary)]">
                            A clean layered map of Memo CLI internals, kept consistent with the
                            current Linear-style visual language.
                        </p>

                        <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)]">
                            <MemoArchitectureDiagram />
                        </div>
                    </div>
                </section>

                <section className="border-b border-[var(--border-default)] px-4 py-16 md:px-8 md:py-20">
                    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                        <div>
                            <div className="badge">Quick Start</div>
                            <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
                                Get productive in under a minute
                            </h2>
                            <p className="mt-3 max-w-xl text-[var(--text-secondary)]">
                                Install, configure a provider, and launch the interactive CLI.
                            </p>

                            <div className="mt-7 space-y-5">
                                {workflowSteps.map((item) => (
                                    <div key={item.step} className="flex gap-3">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-secondary)]">
                                            {item.step}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                                {item.title}
                                            </h3>
                                            <p className="text-sm text-[var(--text-secondary)]">
                                                {item.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)]">
                            <div className="border-b border-[var(--border-default)] px-4 py-2 text-xs text-[var(--text-tertiary)]">
                                terminal
                            </div>
                            <div className="space-y-4 p-5 font-mono text-sm">
                                {workflowSteps.map((item) => (
                                    <div key={item.step}>
                                        <p className="text-[var(--text-tertiary)]">
                                            # {item.title}
                                        </p>
                                        <p className="text-[var(--text-primary)]">
                                            <span className="text-[var(--text-secondary)]">$</span>{' '}
                                            {item.code}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="px-4 py-16 md:px-8 md:py-20">
                    <div className="mx-auto max-w-4xl rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-8 text-center md:px-10">
                        <h2 className="text-2xl font-semibold text-[var(--text-primary)] md:text-3xl">
                            Ready to try Memo CLI?
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-[var(--text-secondary)]">
                            Install Memo and start working with an agent that stays inside your
                            terminal.
                        </p>
                        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
                </section>

                <footer className="border-t border-[var(--border-default)] px-4 pt-10 md:px-8">
                    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 md:flex-row">
                        <div className="flex items-center gap-3">
                            <Image
                                src={`${basePath}/logo-dark.svg`}
                                width={28}
                                height={28}
                                alt="Memo Logo"
                                className="rounded-md"
                            />
                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                                Memo CLI
                            </span>
                        </div>
                        <div className="flex gap-6 text-sm text-[var(--text-secondary)]">
                            <Link
                                href="/docs"
                                className="transition-colors hover:text-[var(--text-primary)]"
                            >
                                Documentation
                            </Link>
                            <a
                                href="https://github.com/minorcell/memo-cli"
                                target="_blank"
                                rel="noreferrer"
                                className="transition-colors hover:text-[var(--text-primary)]"
                            >
                                GitHub
                            </a>
                            <a
                                href="https://www.npmjs.com/package/@memo-code/memo"
                                target="_blank"
                                rel="noreferrer"
                                className="transition-colors hover:text-[var(--text-primary)]"
                            >
                                npm
                            </a>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            © 2025 Memo CLI · MIT License
                        </p>
                    </div>
                </footer>
            </main>
        </div>
    )
}
