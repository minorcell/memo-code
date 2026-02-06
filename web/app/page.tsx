import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { listDocPages } from '@/lib/docs'

const featureCards = [
    {
        title: '本地优先运行',
        description: '在终端内完成主要协作流程，更贴近开发者的日常工作环境。',
    },
    {
        title: '内置代码工具集',
        description: '通过自然语言驱动读取、搜索、修改与命令执行等常见编码任务。',
    },
    {
        title: '并发任务处理',
        description: '面对多文件或多步骤场景时，可更高效地推进整体任务流程。',
    },
    {
        title: '安全审批机制',
        description: '关键操作支持确认与控制，让自动化效率和执行安全保持平衡。',
    },
    {
        title: 'MCP 能力扩展',
        description: '支持连接外部工具与服务，按团队需求逐步扩展能力边界。',
    },
    {
        title: '连续上下文协作',
        description: '保留项目语境并支持持续迭代，减少重复沟通和上下文重建。',
    },
]

const installSteps = [
    {
        title: '安装',
        code: 'npm install -g @memo-code/memo',
        note: '推荐先用 npm 方式全局安装。',
    },
    {
        title: '配置',
        code: 'export DEEPSEEK_API_KEY=your_key',
        note: '或使用 OPENAI_API_KEY。',
    },
    {
        title: '启动',
        code: 'memo',
        note: '进入交互模式开始使用。',
    },
]

export default async function Home() {
    const docs = await listDocPages()

    return (
        <>
            <SiteHeader />

            <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 md:px-8">
                <section className="panel fade-in-up rounded-[2rem] border-black/10 bg-[linear-gradient(140deg,rgba(211,84,47,0.16),rgba(15,127,129,0.1),rgba(255,255,255,0.88))] p-6 md:p-10">
                    <p className="chip inline-block">Memo CLI</p>
                    <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-[var(--color-ink)] md:text-6xl">
                        运行在终端里的轻量级编码代理
                    </h1>
                    <p className="mt-4 max-w-3xl text-base text-[var(--color-muted)] md:text-lg">
                        Memo Code
                        是一个开源的终端编码代理，能够理解项目上下文，并通过自然语言协助你更快完成编码、排障和日常开发任务。
                    </p>

                    <div className="mt-6 rounded-2xl border border-black/10 bg-[#111a23] p-4 text-[#f5f8ff] md:p-5">
                        <p className="text-xs font-semibold tracking-[0.08em] text-[#9db0c3]">
                            INSTALL
                        </p>
                        <pre className="mt-2 overflow-x-auto font-mono text-sm leading-7 md:text-base">
                            <code>npm install -g @memo-code/memo</code>
                        </pre>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3" id="install">
                        <Link
                            href="/docs"
                            className="rounded-xl bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                        >
                            查看文档
                        </Link>
                        <a
                            href="https://www.npmjs.com/package/@memo-code/memo"
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-black/15 bg-[var(--color-surface-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-ink)] transition-transform hover:-translate-y-0.5"
                        >
                            打开 NPM 包页
                        </a>
                    </div>
                </section>

                <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {featureCards.map((feature, index) => (
                        <article
                            key={feature.title}
                            className="panel fade-in-up rounded-2xl p-5"
                            style={{ animationDelay: `${index * 0.04}s` }}
                        >
                            <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                                {feature.title}
                            </h2>
                            <p className="mt-2 text-sm text-[var(--color-muted)]">
                                {feature.description}
                            </p>
                        </article>
                    ))}
                </section>

                <section className="mt-10">
                    <div className="panel rounded-2xl p-6 md:p-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="chip inline-block">Quick Start</p>
                                <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)] md:text-3xl">
                                    三步上手
                                </h2>
                            </div>
                            <Link
                                href="/docs/getting-started"
                                className="rounded-xl border border-black/15 bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
                            >
                                查看详细步骤
                            </Link>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
                            {installSteps.map((item) => (
                                <article
                                    key={item.title}
                                    className="rounded-xl border border-black/10 bg-white/65 p-4"
                                >
                                    <p className="text-sm font-semibold text-[var(--color-ink)]">
                                        {item.title}
                                    </p>
                                    <pre className="mt-3 overflow-x-auto rounded-lg bg-[#121a23] p-3 font-mono text-xs text-[#f5f8ff]">
                                        <code>{item.code}</code>
                                    </pre>
                                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                                        {item.note}
                                    </p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mt-10">
                    <div className="mb-4 flex items-end justify-between">
                        <div>
                            <p className="chip inline-block">Documentation Modules</p>
                            <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)] md:text-3xl">
                                文档站导航
                            </h2>
                        </div>
                        <Link
                            href="/docs"
                            className="text-sm font-semibold text-[var(--color-accent)]"
                        >
                            打开文档站 →
                        </Link>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        {docs.map((page) => (
                            <Link
                                key={page.slug}
                                href={`/docs/${page.slug}`}
                                className="panel rounded-xl px-4 py-4 transition-transform hover:-translate-y-0.5"
                            >
                                <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                                    {page.category}
                                </p>
                                <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
                                    {page.title}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-muted)]">
                                    {page.summary}
                                </p>
                            </Link>
                        ))}
                    </div>
                </section>
            </main>
        </>
    )
}
