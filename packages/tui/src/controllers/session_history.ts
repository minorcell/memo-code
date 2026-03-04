import type { SessionListItem } from '../http/api_types'
import { withSharedCoreServerClient } from '../http/shared_core_client'

export type SessionHistoryEntry = {
    id: string
    sessionId: string
    cwd: string
    input: string
    ts: number
}

function parseTimestamp(value: string): number {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function resolveEntryTitle(summary: SessionListItem): string {
    const title = summary.title?.trim()
    if (title) return title
    return summary.sessionId || summary.id
}

export async function loadSessionHistoryEntries(options: {
    cwd: string
    keyword?: string
    activeSessionId?: string
    limit?: number
}): Promise<SessionHistoryEntry[]> {
    const limit = options.limit ?? 10
    if (limit <= 0) return []

    const pageSize = Math.max(limit * 3, 20)
    const response = await withSharedCoreServerClient((client) =>
        client.listSessions({
            page: 1,
            pageSize,
            sortBy: 'updatedAt',
            order: 'desc',
            workspaceCwd: options.cwd,
            q: options.keyword?.trim() || undefined,
        }),
    )

    const activeSessionId = options.activeSessionId?.trim()
    const entries: SessionHistoryEntry[] = []

    for (const summary of response.items) {
        if (entries.length >= limit) break
        if (activeSessionId && summary.sessionId === activeSessionId) continue

        entries.push({
            id: summary.id,
            sessionId: summary.sessionId,
            cwd: summary.cwd,
            input: resolveEntryTitle(summary),
            ts: parseTimestamp(summary.date.updatedAt),
        })
    }

    return entries
}
