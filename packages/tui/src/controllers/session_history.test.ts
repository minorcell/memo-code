import { describe, expect, test, vi } from 'vitest'

const { withSharedCoreServerClientMock } = vi.hoisted(() => ({
    withSharedCoreServerClientMock: vi.fn(),
}))

vi.mock('../http/shared_core_client', () => ({
    withSharedCoreServerClient: withSharedCoreServerClientMock,
}))

import { loadSessionHistoryEntries } from './session_history'

describe('loadSessionHistoryEntries', () => {
    test('prefers title and maps API response', async () => {
        withSharedCoreServerClientMock.mockImplementation(async (runner) =>
            runner({
                listSessions: vi.fn().mockResolvedValue({
                    items: [
                        {
                            id: 'history-1',
                            sessionId: 'session-1',
                            filePath: '/tmp/session-1.jsonl',
                            title: 'Express.js REST API',
                            project: 'demo',
                            workspaceId: 'ws-1',
                            cwd: '/tmp/demo',
                            date: {
                                day: '2026-03-03',
                                startedAt: '2026-03-03T00:00:00.000Z',
                                updatedAt: '2026-03-03T00:01:00.000Z',
                            },
                            status: 'idle',
                            turnCount: 1,
                            tokenUsage: { prompt: 1, completion: 1, total: 2 },
                            toolUsage: {
                                total: 0,
                                success: 0,
                                failed: 0,
                                denied: 0,
                                cancelled: 0,
                            },
                        },
                    ],
                    page: 1,
                    pageSize: 20,
                    total: 1,
                    totalPages: 1,
                }),
            }),
        )

        const entries = await loadSessionHistoryEntries({ cwd: '/tmp/demo', limit: 10 })
        expect(entries).toHaveLength(1)
        expect(entries[0]?.input).toBe('Express.js REST API')
    })

    test('filters out active session id', async () => {
        withSharedCoreServerClientMock.mockImplementation(async (runner) =>
            runner({
                listSessions: vi.fn().mockResolvedValue({
                    items: [
                        {
                            id: 'history-1',
                            sessionId: 'active-session',
                            filePath: '/tmp/session-1.jsonl',
                            title: 'Current session',
                            project: 'demo',
                            workspaceId: 'ws-1',
                            cwd: '/tmp/demo',
                            date: {
                                day: '2026-03-03',
                                startedAt: '2026-03-03T00:00:00.000Z',
                                updatedAt: '2026-03-03T00:01:00.000Z',
                            },
                            status: 'idle',
                            turnCount: 1,
                            tokenUsage: { prompt: 1, completion: 1, total: 2 },
                            toolUsage: {
                                total: 0,
                                success: 0,
                                failed: 0,
                                denied: 0,
                                cancelled: 0,
                            },
                        },
                    ],
                    page: 1,
                    pageSize: 20,
                    total: 1,
                    totalPages: 1,
                }),
            }),
        )

        const entries = await loadSessionHistoryEntries({
            cwd: '/tmp/demo',
            activeSessionId: 'active-session',
            limit: 10,
        })
        expect(entries).toHaveLength(0)
    })
})
