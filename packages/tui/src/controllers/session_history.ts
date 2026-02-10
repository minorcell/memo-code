import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export type SessionHistoryEntry = {
    id: string
    cwd: string
    input: string
    ts: number
    sessionFile: string
}

type SessionFileCandidate = {
    path: string
    mtimeMs: number
}

function normalizeCwd(input: string): string {
    const normalized = resolve(input)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function matchSessionCwd(cwd: string, sessionCwd: string | null): boolean {
    if (!sessionCwd) return false
    return normalizeCwd(cwd) === normalizeCwd(sessionCwd)
}

function formatSessionFileName(filePath: string): string {
    return basename(filePath).replace(/\.jsonl$/i, '')
}

function extractSessionSummary(raw: string): {
    firstPrompt: string | null
    sessionCwd: string | null
} {
    let firstPrompt: string | null = null
    let sessionCwd: string | null = null

    for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let event: any
        try {
            event = JSON.parse(trimmed)
        } catch {
            continue
        }

        if (!event || typeof event !== 'object') continue

        if (event.type === 'session_start' && !sessionCwd) {
            const cwd = event.meta?.cwd
            if (typeof cwd === 'string' && cwd.trim()) {
                sessionCwd = cwd
            }
            continue
        }

        if (event.type === 'turn_start' && !firstPrompt) {
            const content = typeof event.content === 'string' ? event.content.trim() : ''
            if (content) firstPrompt = content
        }
    }

    return { firstPrompt, sessionCwd }
}

async function buildHistoryEntryFromFile(
    filePath: string,
    cwd: string,
    mtimeMs: number,
): Promise<SessionHistoryEntry | null> {
    try {
        const raw = await readFile(filePath, 'utf8')
        const { firstPrompt, sessionCwd } = extractSessionSummary(raw)
        if (!matchSessionCwd(cwd, sessionCwd)) {
            return null
        }

        return {
            id: filePath,
            cwd,
            input: firstPrompt?.trim() || formatSessionFileName(filePath),
            ts: mtimeMs,
            sessionFile: filePath,
        }
    } catch {
        return null
    }
}

async function collectDatePartitionedSessionCandidates(
    sessionsDir: string,
): Promise<SessionFileCandidate[]> {
    const listDirectory = async (dirPath: string) => {
        try {
            return await readdir(dirPath, { withFileTypes: true })
        } catch {
            return [] as import('node:fs').Dirent[]
        }
    }

    const yearDirs = (await listDirectory(sessionsDir)).filter(
        (entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name),
    )

    const filePaths: string[] = []

    for (const yearDir of yearDirs) {
        const yearPath = join(sessionsDir, yearDir.name)
        const monthDirs = (await listDirectory(yearPath)).filter(
            (entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name),
        )

        for (const monthDir of monthDirs) {
            const monthPath = join(yearPath, monthDir.name)
            const dayDirs = (await listDirectory(monthPath)).filter(
                (entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name),
            )

            for (const dayDir of dayDirs) {
                const dayPath = join(monthPath, dayDir.name)
                const files = (await listDirectory(dayPath)).filter(
                    (entry) => entry.isFile() && entry.name.endsWith('.jsonl'),
                )

                for (const file of files) {
                    filePaths.push(join(dayPath, file.name))
                }
            }
        }
    }

    const candidates = await Promise.all(
        filePaths.map(async (filePath) => {
            try {
                const fileStat = await stat(filePath)
                return { path: filePath, mtimeMs: fileStat.mtimeMs }
            } catch {
                return null
            }
        }),
    )

    return candidates.filter((item): item is SessionFileCandidate => Boolean(item))
}

export async function loadSessionHistoryEntries(options: {
    sessionsDir: string
    cwd: string
    keyword?: string
    activeSessionFile?: string
    limit?: number
}): Promise<SessionHistoryEntry[]> {
    const normalizedActive = options.activeSessionFile ? resolve(options.activeSessionFile) : null

    const candidates = await collectDatePartitionedSessionCandidates(options.sessionsDir)
    const filteredCandidates = candidates
        .filter((candidate) => !normalizedActive || resolve(candidate.path) !== normalizedActive)
        .filter(
            (candidate, index, list) =>
                list.findIndex((other) => resolve(other.path) === resolve(candidate.path)) ===
                index,
        )
        .sort((a, b) => b.mtimeMs - a.mtimeMs)

    const keyword = options.keyword?.trim().toLowerCase()
    const limit = options.limit ?? 10

    const entries: SessionHistoryEntry[] = []

    for (const candidate of filteredCandidates) {
        if (entries.length >= limit) break
        const entry = await buildHistoryEntryFromFile(
            candidate.path,
            options.cwd,
            candidate.mtimeMs,
        )
        if (!entry) continue
        if (keyword && !entry.input.toLowerCase().includes(keyword)) {
            continue
        }
        entries.push(entry)
    }

    return entries
}
