import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cache } from 'react'
import { marked } from 'marked'

export type DocCategory = 'Basics' | 'Capabilities' | 'Operations'

export type DocSection = {
    id: string
    title: string
    html: string
}

export type DocPageSummary = {
    slug: string
    title: string
    summary: string
    order: number
    category: DocCategory
}

export type DocPage = DocPageSummary & {
    introHtml: string
    sections: DocSection[]
}

export type DocsHome = {
    title: string
    html: string
}

type DocSpec = {
    slug: string
    fileName: string
    order: number
    category: DocCategory
}

const DOC_SPECS: DocSpec[] = [
    {
        slug: 'getting-started',
        fileName: 'getting-started.md',
        order: 1,
        category: 'Basics',
    },
    {
        slug: 'cli-tui',
        fileName: 'cli-tui.md',
        order: 2,
        category: 'Basics',
    },
    {
        slug: 'configuration',
        fileName: 'configuration.md',
        order: 3,
        category: 'Capabilities',
    },
    {
        slug: 'tools',
        fileName: 'tools.md',
        order: 4,
        category: 'Capabilities',
    },
    {
        slug: 'approval-safety',
        fileName: 'approval-safety.md',
        order: 5,
        category: 'Capabilities',
    },
    {
        slug: 'mcp',
        fileName: 'mcp.md',
        order: 6,
        category: 'Capabilities',
    },
    {
        slug: 'subagent',
        fileName: 'subagent.md',
        order: 7,
        category: 'Capabilities',
    },
    {
        slug: 'sessions-history',
        fileName: 'sessions-history.md',
        order: 9,
        category: 'Operations',
    },
    {
        slug: 'troubleshooting',
        fileName: 'troubleshooting.md',
        order: 10,
        category: 'Operations',
    },
]

const DOCS_DIR_CANDIDATES = [
    resolve(process.cwd(), 'docs', 'user'),
    resolve(process.cwd(), '..', 'docs', 'user'),
]

const DOCS_DIR =
    DOCS_DIR_CANDIDATES.find((candidate) => existsSync(candidate)) ?? DOCS_DIR_CANDIDATES[1]

const USER_GUIDE_FILE = 'README.md'

function normalizeDocLinks(markdown: string) {
    return markdown.replace(/\]\((?:\.\/)?([a-z0-9-]+)\.md\)/gi, '](/docs/$1)')
}

function slugifyHeading(text: string) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[`*_~]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

function stripMarkdown(text: string) {
    return text
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/[*_>#~-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function toHtml(markdown: string) {
    return marked.parse(markdown) as string
}

function splitMarkdownDoc(markdown: string) {
    const normalized = normalizeDocLinks(markdown).replace(/\r/g, '').trim()
    const lines = normalized.split('\n')
    const titleLine = lines.find((line) => line.startsWith('# '))
    const title = titleLine ? titleLine.slice(2).trim() : 'Untitled'

    const body = normalized.replace(/^#\s+.+\n*/, '').trim()
    const sectionMatches = [...body.matchAll(/^##\s+(.+)$/gm)]

    if (!sectionMatches.length) {
        const summaryLine = stripMarkdown(
            body
                .split('\n')
                .map((line) => line.trim())
                .find((line) => line.length > 0) ?? '',
        )
        return {
            title,
            summary: summaryLine,
            introMarkdown: body,
            sections: [] as Array<{ id: string; title: string; markdown: string }>,
        }
    }

    const firstSectionIndex = sectionMatches[0]?.index ?? 0
    const introMarkdown = body.slice(0, firstSectionIndex).trim()

    const sections = sectionMatches.map((match, index) => {
        const sectionTitle = match[1].trim()
        const contentStart = (match.index ?? 0) + match[0].length
        const contentEnd =
            index < sectionMatches.length - 1
                ? (sectionMatches[index + 1].index ?? body.length)
                : body.length
        const sectionMarkdown = body.slice(contentStart, contentEnd).trim()
        return {
            id: slugifyHeading(sectionTitle),
            title: sectionTitle,
            markdown: sectionMarkdown,
        }
    })

    const summarySource =
        introMarkdown ||
        sections
            .map((section) => section.markdown)
            .join('\n')
            .trim()
    const summaryLine = stripMarkdown(
        summarySource
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0) ?? '',
    )

    return {
        title,
        summary: summaryLine,
        introMarkdown,
        sections,
    }
}

const loadMarkdownFile = cache(async (fileName: string) => {
    const fullPath = resolve(DOCS_DIR, fileName)
    return readFile(fullPath, 'utf8')
})

const loadDocBySpec = cache(async (spec: DocSpec): Promise<DocPage> => {
    const markdown = await loadMarkdownFile(spec.fileName)
    const parsed = splitMarkdownDoc(markdown)
    const summary = parsed.summary || `Read ${parsed.title}`

    return {
        slug: spec.slug,
        title: parsed.title,
        summary,
        order: spec.order,
        category: spec.category,
        introHtml: parsed.introMarkdown ? toHtml(parsed.introMarkdown) : '',
        sections: parsed.sections.map((section) => ({
            id: section.id,
            title: section.title,
            html: section.markdown ? toHtml(section.markdown) : '',
        })),
    }
})

export const listDocPages = cache(async () => {
    const docs = await Promise.all(DOC_SPECS.map((spec) => loadDocBySpec(spec)))
    return docs.sort((a, b) => a.order - b.order)
})

export const getDocPage = cache(async (slug: string) => {
    const spec = DOC_SPECS.find((item) => item.slug === slug)
    if (!spec) return undefined
    return loadDocBySpec(spec)
})

export async function getDocNeighbors(slug: string) {
    const pages = await listDocPages()
    const index = pages.findIndex((page) => page.slug === slug)
    if (index === -1) {
        return { previous: undefined, next: undefined }
    }
    return {
        previous: index > 0 ? pages[index - 1] : undefined,
        next: index < pages.length - 1 ? pages[index + 1] : undefined,
    }
}

export const getDocsHome = cache(async (): Promise<DocsHome> => {
    const markdown = await loadMarkdownFile(USER_GUIDE_FILE)
    const parsed = splitMarkdownDoc(markdown)

    const mergedMarkdown = [
        parsed.introMarkdown,
        ...parsed.sections.map((s) => `## ${s.title}\n${s.markdown}`),
    ]
        .filter(Boolean)
        .join('\n\n')
        .trim()

    return {
        title: parsed.title,
        html: toHtml(mergedMarkdown),
    }
})
