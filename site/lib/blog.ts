import { readdir, readFile } from 'node:fs/promises'
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

type BlogFrontmatter = {
  title: string
  description: string
  date: string
  order: number
}

const BLOG_DIR = resolve(process.cwd(), 'content', 'blog')
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?/

function parseFrontmatter(markdown: string, slug: string) {
  const normalized = markdown.replace(/\r/g, '').trim()
  const match = normalized.match(FRONTMATTER_REGEX)
  if (!match) {
    throw new Error(
      `Missing frontmatter in blog post: ${slug}. Required fields: title, description, date, order.`,
    )
  }

  const frontmatter = match[1]
  const body = normalized.slice(match[0].length).trim()
  const fieldMap = new Map<string, string>()

  for (const rawLine of frontmatter.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '')
    fieldMap.set(key, value)
  }

  const title = fieldMap.get('title')
  const description = fieldMap.get('description')
  const date = fieldMap.get('date')
  const orderRaw = fieldMap.get('order')
  const order = Number.parseInt(orderRaw ?? '', 10)

  if (!title || !description || !date || Number.isNaN(order)) {
    throw new Error(
      `Invalid frontmatter in ${slug}. Expected title, description, date(YYYY-MM-DD), order(number).`,
    )
  }

  return {
    meta: {
      title,
      description,
      date,
      order,
    } satisfies BlogFrontmatter,
    body,
  }
}

function removeDuplicateTitleHeading(body: string, title: string) {
  const firstHeading = body.match(/^#\s+(.+)\n+/)
  if (!firstHeading) return body
  if (firstHeading[1].trim() !== title.trim()) return body

  return body.slice(firstHeading[0].length).trim()
}

const listMarkdownFiles = cache(async () => {
  const entries = await readdir(BLOG_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
})

const loadMarkdownFile = cache(async (fileName: string) => {
  const fullPath = resolve(BLOG_DIR, fileName)
  return readFile(fullPath, 'utf8')
})

const loadPostByFileName = cache(async (fileName: string): Promise<BlogPost> => {
  const slug = fileName.replace(/\.md$/i, '')
  const markdown = await loadMarkdownFile(fileName)
  const parsed = parseFrontmatter(markdown, slug)
  const contentBody = removeDuplicateTitleHeading(parsed.body, parsed.meta.title)

  return {
    slug,
    title: parsed.meta.title,
    summary: parsed.meta.description,
    publishedAt: parsed.meta.date,
    order: parsed.meta.order,
    contentHtml: marked.parse(contentBody) as string,
  }
})

export const listBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  const fileNames = await listMarkdownFiles()
  const posts = await Promise.all(fileNames.map((fileName) => loadPostByFileName(fileName)))
  return posts
    .sort((a, b) => b.order - a.order || b.publishedAt.localeCompare(a.publishedAt))
    .map(({ slug, title, summary, publishedAt, order }) => ({
      slug,
      title,
      summary,
      publishedAt,
      order,
    }))
})

export const getBlogPost = cache(async (slug: string) => {
  const fileNames = await listMarkdownFiles()
  const fileName = `${slug}.md`
  if (!fileNames.includes(fileName)) return undefined
  return loadPostByFileName(fileName)
})
