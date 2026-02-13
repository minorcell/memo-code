import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cache } from 'react'
import { marked } from 'marked'

export type BlogPostSummary = {
  slug: string
  title: string
  summary: string
  publishedAt: string
  order: number
}

export type BlogPost = BlogPostSummary & {
  contentHtml: string
}

type BlogSpec = {
  slug: string
  fileName: string
  publishedAt: string
  order: number
}

const BLOG_DIR = resolve(process.cwd(), 'content', 'blog')

const BLOG_SPECS: BlogSpec[] = [
  {
    slug: 'cold-start-mcp-cache-swr',
    fileName: 'cold-start-mcp-cache-swr.md',
    publishedAt: '2026-02-13',
    order: 3,
  },
  {
    slug: 'tool-system-design',
    fileName: 'tool-system-design.md',
    publishedAt: '2026-02-13',
    order: 2,
  },
  {
    slug: 'terminal-tui-multiline-editor',
    fileName: 'terminal-tui-multiline-editor.md',
    publishedAt: '2026-02-12',
    order: 1,
  },
]

function stripMarkdown(text: string) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_>#~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitMarkdownPost(markdown: string) {
  const normalized = markdown.replace(/\r/g, '').trim()
  const lines = normalized.split('\n')
  const titleLine = lines.find((line) => line.startsWith('# '))
  const title = titleLine ? titleLine.slice(2).trim() : 'Untitled'

  const body = normalized.replace(/^#\s+.+\n*/, '').trim()
  const summarySource = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'))

  return {
    title,
    summary: stripMarkdown(summarySource ?? '') || `Read ${title}`,
    body,
  }
}

const loadMarkdownFile = cache(async (fileName: string) => {
  const fullPath = resolve(BLOG_DIR, fileName)
  return readFile(fullPath, 'utf8')
})

const loadPostBySpec = cache(async (spec: BlogSpec): Promise<BlogPost> => {
  const markdown = await loadMarkdownFile(spec.fileName)
  const parsed = splitMarkdownPost(markdown)

  return {
    slug: spec.slug,
    title: parsed.title,
    summary: parsed.summary,
    publishedAt: spec.publishedAt,
    order: spec.order,
    contentHtml: marked.parse(parsed.body) as string,
  }
})

export const listBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  const posts = await Promise.all(BLOG_SPECS.map((spec) => loadPostBySpec(spec)))
  return posts
    .sort((a, b) => b.order - a.order)
    .map(({ slug, title, summary, publishedAt, order }) => ({
      slug,
      title,
      summary,
      publishedAt,
      order,
    }))
})

export const getBlogPost = cache(async (slug: string) => {
  const spec = BLOG_SPECS.find((item) => item.slug === slug)
  if (!spec) return undefined
  return loadPostBySpec(spec)
})
