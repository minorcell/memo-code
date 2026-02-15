import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { normalizeWorkspacePath } from './workspace.js'
import type { SkillRecord } from '../web/types.js'

type SkillScope = 'project' | 'global'

export type SkillDetail = {
    id: string
    path: string
    name: string
    description: string
    content: string
}

export class SkillsAdminError extends Error {
    constructor(
        readonly code: 'BAD_REQUEST' | 'NOT_FOUND',
        message: string,
    ) {
        super(message)
    }
}

type ListSkillsOptions = {
    scope?: unknown
    q?: unknown
    workspaceCwd?: string | null
}

type CreateSkillOptions = {
    scope?: unknown
    name?: unknown
    description?: unknown
    content?: unknown
    workspaceCwd?: string | null
}

type UpdateSkillOptions = {
    description?: unknown
    content?: unknown
}

type SkillLookupOptions = {
    workspaceCwds?: string[]
}

function encodePath(path: string): string {
    return Buffer.from(path, 'utf8').toString('base64url')
}

function decodePath(id: string): string {
    try {
        return Buffer.from(id, 'base64url').toString('utf8')
    } catch {
        throw new SkillsAdminError('BAD_REQUEST', 'invalid skill id')
    }
}

function memoHome(): string {
    const configured = process.env.MEMO_HOME
    if (!configured || !configured.trim()) return join(homedir(), '.memo')
    if (!configured.startsWith('~')) return configured
    return join(homedir(), configured.slice(1))
}

function normalizeQuery(input: unknown): string {
    if (typeof input !== 'string') return ''
    return input.trim().toLowerCase()
}

function globalSkillRoot(): string {
    return resolve(join(memoHome(), 'skills'))
}

function projectSkillRoot(workspaceCwd: string): string {
    return resolve(join(workspaceCwd, '.codex', 'skills'))
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

async function walkSkillFiles(root: string): Promise<string[]> {
    const files: string[] = []

    const walk = async (path: string): Promise<void> => {
        let entries: import('node:fs').Dirent[]
        try {
            entries = await readdir(path, {
                withFileTypes: true,
            })
        } catch {
            return
        }

        await Promise.all(
            entries.map(async (entry) => {
                const fullPath = join(path, entry.name)
                if (entry.isSymbolicLink()) return
                if (entry.isDirectory()) {
                    await walk(fullPath)
                    return
                }
                if (entry.isFile() && entry.name === 'SKILL.md') {
                    files.push(resolve(fullPath))
                }
            }),
        )
    }

    await walk(root)
    files.sort((a, b) => a.localeCompare(b))
    return files
}

function parseFrontmatter(content: string): { name: string; description: string } {
    const lines = content.split(/\r?\n/)
    if (lines[0]?.trim() !== '---') {
        return { name: '', description: '' }
    }
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end <= 0) {
        return { name: '', description: '' }
    }

    const front = lines.slice(1, end).join('\n')
    const nameMatch = front.match(/^name\s*:\s*(.+)$/m)
    const descMatch = front.match(/^description\s*:\s*(.+)$/m)
    return {
        name: nameMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '',
        description: descMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '',
    }
}

function buildSkillContent(name: string, description: string, body: string | undefined): string {
    const contentBody = body?.trim() || `# ${name}\n\n${description}\n`
    return ['---', `name: ${name}`, `description: ${description}`, '---', '', contentBody, ''].join(
        '\n',
    )
}

function pathWithinRoot(path: string, root: string): boolean {
    const normalizedPath = normalizeWorkspacePath(path)
    const normalizedRoot = normalizeWorkspacePath(root)
    if (normalizedPath === normalizedRoot) return true
    return normalizedPath.startsWith(`${normalizedRoot}/`)
}

function parseScope(input: unknown): SkillScope | null {
    if (input === 'project') return 'project'
    if (input === 'global') return 'global'
    return null
}

function resolveWorkspaceRoots(workspaceCwds: string[] | undefined): string[] {
    if (!workspaceCwds || workspaceCwds.length === 0) return []
    return workspaceCwds
        .map((item) => item.trim())
        .filter(Boolean)
        .map((cwd) => projectSkillRoot(cwd))
}

function buildAllowedRoots(options?: SkillLookupOptions): string[] {
    const roots = [globalSkillRoot(), ...resolveWorkspaceRoots(options?.workspaceCwds)]
    return Array.from(new Set(roots.map((root) => normalizeWorkspacePath(root))))
}

async function ensureAllowedSkillPath(path: string, options?: SkillLookupOptions): Promise<void> {
    const resolved = resolve(path)
    const allowedRoots = buildAllowedRoots(options)
    const allowed = allowedRoots.some((root) => pathWithinRoot(resolved, root))
    if (!allowed) {
        throw new SkillsAdminError('BAD_REQUEST', 'skill path is outside allowed roots')
    }
}

export async function listSkills(options: ListSkillsOptions): Promise<{ items: SkillRecord[] }> {
    const q = normalizeQuery(options.q)
    const scopeInput = typeof options.scope === 'string' ? options.scope : ''
    const workspaceCwd =
        typeof options.workspaceCwd === 'string' && options.workspaceCwd.trim()
            ? options.workspaceCwd.trim()
            : null

    const scopes: SkillScope[] = []
    if (scopeInput === 'project') {
        scopes.push('project')
    } else if (scopeInput === 'global') {
        scopes.push('global')
    } else {
        scopes.push('global')
        if (workspaceCwd) {
            scopes.push('project')
        }
    }

    if (scopes.includes('project') && !workspaceCwd) {
        throw new SkillsAdminError('BAD_REQUEST', 'workspaceId is required when scope=project')
    }

    const items: SkillRecord[] = []

    for (const scope of scopes) {
        const root =
            scope === 'global' ? globalSkillRoot() : projectSkillRoot(workspaceCwd as string)
        const files = await walkSkillFiles(root)
        for (const filePath of files) {
            const raw = await readFile(filePath, 'utf8')
            const parsed = parseFrontmatter(raw)
            const name = parsed.name || basename(dirname(filePath))
            const description = parsed.description || ''
            const payload = `${name}\n${description}\n${filePath}`.toLowerCase()
            if (q && !payload.includes(q)) continue

            items.push({
                id: encodePath(filePath),
                name,
                description,
                scope,
                path: filePath,
            })
        }
    }

    return { items }
}

export async function getSkill(id: string, options?: SkillLookupOptions): Promise<SkillDetail> {
    const path = decodePath(id)
    await ensureAllowedSkillPath(path, options)
    const exists = await fileExists(path)
    if (!exists) {
        throw new SkillsAdminError('NOT_FOUND', 'skill not found')
    }
    const content = await readFile(path, 'utf8')
    const parsed = parseFrontmatter(content)
    return {
        id,
        path,
        name: parsed.name || basename(dirname(path)),
        description: parsed.description || '',
        content,
    }
}

export async function createSkill(
    input: CreateSkillOptions,
): Promise<{ created: true; item: SkillRecord }> {
    const scope = parseScope(input.scope)
    if (!scope) throw new SkillsAdminError('BAD_REQUEST', 'scope must be project or global')

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) throw new SkillsAdminError('BAD_REQUEST', 'name is required')

    const description =
        typeof input.description === 'string' && input.description.trim()
            ? input.description.trim()
            : `${name} skill`

    let root: string
    if (scope === 'global') {
        root = globalSkillRoot()
    } else {
        const workspaceCwd =
            typeof input.workspaceCwd === 'string' && input.workspaceCwd.trim()
                ? input.workspaceCwd.trim()
                : ''
        if (!workspaceCwd) {
            throw new SkillsAdminError('BAD_REQUEST', 'workspaceId is required when scope=project')
        }
        root = projectSkillRoot(workspaceCwd)
    }

    const slug = name.replace(/[^A-Za-z0-9._-]/g, '-')
    const skillDir = join(root, slug)
    const skillPath = join(skillDir, 'SKILL.md')

    await ensureAllowedSkillPath(skillPath, {
        workspaceCwds: scope === 'project' ? [String(input.workspaceCwd ?? '')] : [],
    })
    if (await fileExists(skillPath)) {
        throw new SkillsAdminError('BAD_REQUEST', 'skill already exists')
    }

    await mkdir(skillDir, { recursive: true })
    const content = buildSkillContent(
        name,
        description,
        typeof input.content === 'string' ? input.content : undefined,
    )
    await writeFile(skillPath, content, 'utf8')

    return {
        created: true,
        item: {
            id: encodePath(skillPath),
            name,
            description,
            scope,
            path: skillPath,
        },
    }
}

export async function updateSkill(
    id: string,
    input: UpdateSkillOptions,
    options?: SkillLookupOptions,
): Promise<{ updated: true }> {
    const path = decodePath(id)
    await ensureAllowedSkillPath(path, options)
    const exists = await fileExists(path)
    if (!exists) {
        throw new SkillsAdminError('NOT_FOUND', 'skill not found')
    }

    const current = await readFile(path, 'utf8')
    const parsed = parseFrontmatter(current)
    const name = parsed.name || basename(dirname(path))
    const description =
        typeof input.description === 'string' && input.description.trim()
            ? input.description.trim()
            : parsed.description || `${name} skill`

    const content = buildSkillContent(
        name,
        description,
        typeof input.content === 'string' ? input.content : current,
    )
    await writeFile(path, content, 'utf8')

    return { updated: true }
}

export async function removeSkill(
    id: string,
    options?: SkillLookupOptions,
): Promise<{ deleted: true }> {
    const path = decodePath(id)
    await ensureAllowedSkillPath(path, options)
    const exists = await fileExists(path)
    if (!exists) {
        throw new SkillsAdminError('NOT_FOUND', 'skill not found')
    }

    await rm(dirname(path), { recursive: true, force: true })
    return { deleted: true }
}
