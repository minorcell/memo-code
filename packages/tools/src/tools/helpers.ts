import { normalize, resolve, dirname, join, relative, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import ignore, { type Ignore } from 'ignore'

/**
 * 生成标准化的绝对路径，避免因工作目录差异导致的路径错误。
 */
export function normalizePath(rawPath: string) {
    return normalize(resolve(rawPath))
}

function isSubPath(targetPath: string, rootPath: string) {
    const rel = relative(rootPath, targetPath)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function parseWritableRootsFromEnv() {
    const raw = process.env.MEMO_SANDBOX_WRITABLE_ROOTS?.trim()
    if (!raw) return []
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => normalizePath(item))
}

export function getWritableRoots() {
    const roots = new Set<string>()
    roots.add(normalizePath(process.cwd()))
    const memoHome = process.env.MEMO_HOME?.trim() || join(homedir(), '.memo')
    roots.add(normalizePath(memoHome))
    for (const item of parseWritableRootsFromEnv()) {
        roots.add(item)
    }
    return Array.from(roots)
}

export function isWritePathAllowed(absPath: string) {
    const roots = getWritableRoots()
    return roots.some((root) => isSubPath(absPath, root))
}

export function writePathDenyReason(absPath: string) {
    if (isWritePathAllowed(absPath)) return null
    const roots = getWritableRoots()
    return `sandbox 拒绝写入: ${absPath} 不在允许目录内 (${roots.join(', ')})`
}

export const DEFAULT_IGNORE_PATTERNS = [
    'node_modules/',
    '.git/',
    'dist/',
    'out/',
    'build/',
    'coverage/',
    '.cache/',
    '.idea/',
    '.DS_Store',
    '.next/',
    '.turbo/',
    '.pnpm/',
    '.pnpm-store/',
    '*.log',
    'logs/',
    'tmp/',
    'temp/',
    'vendor/',
]

const MAX_RESULT_LINES = 100
const MAX_RESULT_CHARS = 10000
const OVERFLOW_HINT =
    '<system_hint>当前查找结果过多，请细化查找范围（缩小目录、增加更具体的 pattern/glob 或关键词）。</system_hint>'

const ignoreCache = new Map<string, Promise<IgnoreMatcher>>()

export type IgnoreMatcher = {
    root: string
    ignores: (absPath: string) => boolean
}

function toPosixPath(inputPath: string) {
    return inputPath.replace(/\\/g, '/')
}

function findIgnoreRoot(startPath: string): string {
    let dir = resolve(startPath)
    try {
        if (statSync(dir).isFile()) {
            dir = dirname(dir)
        }
    } catch {
        // ignore invalid paths; fall back to cwd
        dir = process.cwd()
    }
    const initial = dir

    while (true) {
        if (existsSync(join(dir, '.gitignore')) || existsSync(join(dir, '.git'))) {
            return dir
        }
        const parent = dirname(dir)
        if (parent === dir) return initial
        dir = parent
    }
}

async function loadGitignore(root: string): Promise<string[]> {
    const gitignorePath = join(root, '.gitignore')
    if (!existsSync(gitignorePath)) return []
    const raw = await readFile(gitignorePath, 'utf8')
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
}

async function buildIgnoreMatcher(root: string): Promise<IgnoreMatcher> {
    const ig = ignore()
    ig.add(DEFAULT_IGNORE_PATTERNS)
    const gitignoreRules = await loadGitignore(root)
    if (gitignoreRules.length > 0) {
        ig.add(gitignoreRules)
    }

    return {
        root,
        ignores: (absPath: string) => {
            const rel = relative(root, absPath)
            if (!rel || rel.startsWith('..')) return false
            return ig.ignores(toPosixPath(rel))
        },
    }
}

export async function getIgnoreMatcher(startPath: string): Promise<IgnoreMatcher> {
    const root = findIgnoreRoot(startPath)
    const cached = ignoreCache.get(root)
    if (cached) return cached
    const matcher = buildIgnoreMatcher(root)
    ignoreCache.set(root, matcher)
    return matcher
}

export function appendLongResultHint(text: string, lineCount: number): string {
    const lines = text.split(/\r?\n/)
    const totalLines = Math.max(lineCount, lines.length)
    let limited = lines.slice(0, MAX_RESULT_LINES).join('\n')
    if (limited.length > MAX_RESULT_CHARS) {
        limited = limited.slice(0, MAX_RESULT_CHARS)
    }

    if (totalLines > MAX_RESULT_LINES || text.length > MAX_RESULT_CHARS) {
        return `${limited}\n\n${OVERFLOW_HINT}`
    }
    return limited
}
