import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, test } from 'vitest'
import { HistoryIndex } from './history_index'

function logFor(sessionId: string, cwd: string, day: string): string {
    return [
        JSON.stringify({
            ts: `${day}T10:00:00.000Z`,
            sessionId,
            type: 'session_start',
            meta: { cwd },
        }),
        JSON.stringify({
            ts: `${day}T10:00:01.000Z`,
            sessionId,
            turn: 1,
            type: 'turn_start',
            content: `hello ${sessionId}`,
        }),
        JSON.stringify({
            ts: `${day}T10:00:02.000Z`,
            sessionId,
            turn: 1,
            type: 'final',
            content: 'done',
            meta: { status: 'ok', tokens: { prompt: 3, completion: 2, total: 5 } },
        }),
    ].join('\n')
}

describe('HistoryIndex', () => {
    test('lists and paginates sessions', async () => {
        const root = await mkdtemp(join(tmpdir(), 'memo-history-index-'))
        const sessionsDir = join(root, 'sessions')
        await mkdir(sessionsDir, { recursive: true })

        const fileA = join(sessionsDir, '2026-02-15-a.jsonl')
        const fileB = join(sessionsDir, '2026-02-14-b.jsonl')
        await writeFile(fileA, logFor('a', '/tmp/project-a', '2026-02-15'), 'utf8')
        await writeFile(fileB, logFor('b', '/tmp/project-b', '2026-02-14'), 'utf8')

        const index = new HistoryIndex({ sessionsDir })
        const list = await index.list({ page: 1, pageSize: 1 })
        assert.strictEqual(list.total, 2)
        assert.strictEqual(list.items.length, 1)

        const detail = await index.getSessionDetail('a')
        assert.ok(detail)
        assert.strictEqual(detail?.sessionId, 'a')

        const events = await index.getSessionEvents('a', '0', 2)
        assert.ok(events)
        assert.strictEqual(events?.items.length, 2)
        assert.strictEqual(events?.nextCursor, '2')
    })
})
