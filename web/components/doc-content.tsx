import type { DocPage } from '@/lib/docs'
import { Link } from 'lucide-react'

type DocContentProps = {
    page: DocPage
}

export function DocContent({ page }: DocContentProps) {
    return (
        <article id="doc-article" className="doc-prose">
            {page.introHtml ? (
                <div className="doc-intro" dangerouslySetInnerHTML={{ __html: page.introHtml }} />
            ) : null}

            {page.sections.map((section) => (
                <section key={section.id} id={section.id} className="doc-section scroll-mt-24">
                    <h2>
                        <a
                            href={`#${section.id}`}
                            className="group inline-flex items-center gap-2 no-underline"
                        >
                            {section.title}
                            <Link className="h-4 w-4 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                    </h2>
                    {section.html ? (
                        <div dangerouslySetInnerHTML={{ __html: section.html }} />
                    ) : null}
                </section>
            ))}
        </article>
    )
}
