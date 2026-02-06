import type { DocPage } from '@/lib/docs'

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
                        <a href={`#${section.id}`} className="doc-heading-link">
                            {section.title}
                            <span aria-hidden className="doc-heading-mark">
                                #
                            </span>
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
