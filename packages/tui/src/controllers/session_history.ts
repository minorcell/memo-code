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
    sessionTitle: string | null
    sessionCwd: string | null
} {
    let firstPrompt: string | null = null
    let sessionTitle: string | null = null
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

        if (event.type === 'session_title' && !sessionTitle) {
            const content = typeof event.content === 'string' ? event.content.trim() : ''
            if (content) sessionTitle = content
        }
    }

    return { firstPrompt, sessionTitle, sessionCwd }
}

async function buildHistoryEntryFromFile(
    filePath: string,
    cwd: string,
    mtimeMs: number,
): Promise<SessionHistoryEntry | null> {
    try {
        const raw = await readFile(filePath, 'utf8')
        const { firstPrompt, sessionTitle, sessionCwd } = extractSessionSummary(raw)
        if (!matchSessionCwd(cwd, sessionCwd)) {
            return null
        }

        const displayTitle =
            sessionTitle?.trim() || firstPrompt?.trim() || formatSessionFileName(filePath)

        return {
            id: filePath,
            cwd,
            input: displayTitle,
            ts: mtimeMs,
            sessionFile: filePath,
        }
    } catch {
        return null
    }
}

async function collectSessionCandidates(sessionsDir: string): Promise<SessionFileCandidate[]> {
    const candidates: SessionFileCandidate[] = []

    const walk = async (dirPath: string): Promise<void> => {
        let entries: import('node:fs').Dirent[]
        try {
            entries = await readdir(dirPath, { withFileTypes: true })
        } catch {
            return
        }

        await Promise.all(
            entries.map(async (entry) => {
                const fullPath = join(dirPath, entry.name)

                if (entry.isSymbolicLink()) {
                    return
                }

                if (entry.isDirectory()) {
                    await walk(fullPath)
                    return
                }

                if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
                    return
                }

                try {
                    const fileStat = await stat(fullPath)
                    candidates.push({ path: fullPath, mtimeMs: fileStat.mtimeMs })
                } catch {
                    // Ignore transient stat/read errors.
                }
            }),
        )
    }

    await walk(sessionsDir)
    return candidates
}

export async function loadSessionHistoryEntries(options: {
    sessionsDir: string
    cwd: string
    keyword?: string
    activeSessionFile?: string
    limit?: number
}): Promise<SessionHistoryEntry[]> {
    const normalizedActive = options.activeSessionFile ? resolve(options.activeSessionFile) : null

    const candidates = await collectSessionCandidates(options.sessionsDir)
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
