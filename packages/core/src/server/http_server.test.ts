import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { startCoreHttpServer, stopCoreHttpServer } from '@memo/core/server/http_server'

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text()
    return text ? (JSON.parse(text) as unknown) : null
}

function normalizePath(value: string): string {
    const normalized = value.replace(/\\/g, '/')
    if (normalized === '/') return normalized
    return normalized.replace(/\/+$/g, '')
}

describe('startCoreHttpServer', () => {
    afterEach(async () => {
        await stopCoreHttpServer()
    })

    test('supports login, auth, and session creation APIs', async () => {
        const handle = await startCoreHttpServer({
            host: '127.0.0.1',
            port: 0,
            password: 'test-password',
        })

        try {
            const publicOpenapi = await fetch(`${handle.url}/api/openapi.json`)
            expect(publicOpenapi.status).toBe(200)

            const login = await fetch(`${handle.url}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ password: 'test-password' }),
            })
            expect(login.status).toBe(200)
            const loginBody = (await readJson(login)) as {
                success: true
                data: { accessToken: string }
            }
            expect(loginBody.success).toBe(true)
            expect(typeof loginBody.data.accessToken).toBe('string')

            const token = loginBody.data.accessToken

            const openapi = await fetch(`${handle.url}/api/openapi.json`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            expect(openapi.status).toBe(200)

            const created = await fetch(`${handle.url}/api/chat/sessions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ sessionId: 'session-http-test' }),
            })
            expect(created.status).toBe(200)
            const createdBody = (await readJson(created)) as {
                success: true
                data: { id: string }
            }
            expect(createdBody.success).toBe(true)
            expect(typeof createdBody.data.id).toBe('string')
            expect(createdBody.data.id).toBe('session-http-test')

            const runtimes = await fetch(`${handle.url}/api/chat/runtimes`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            expect(runtimes.status).toBe(200)
            const runtimesBody = (await readJson(runtimes)) as {
                success: true
                data: { items: Array<{ sessionId: string }> }
            }
            expect(runtimesBody.success).toBe(true)
            expect(
                runtimesBody.data.items.some((item) => item.sessionId === createdBody.data.id),
            ).toBe(true)

            const sendNow = await fetch(
                `${handle.url}/api/chat/sessions/${createdBody.data.id}/queue/send_now`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({}),
                },
            )
            expect(sendNow.status).toBe(200)
            const sendNowBody = (await readJson(sendNow)) as {
                success: true
                data: { triggered: boolean; queued: number }
            }
            expect(sendNowBody.success).toBe(true)
            expect(sendNowBody.data.triggered).toBe(false)

            const removeQueue = await fetch(
                `${handle.url}/api/chat/sessions/${createdBody.data.id}/queue/non-existent`,
                {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
            )
            expect(removeQueue.status).toBe(200)
            const removeQueueBody = (await readJson(removeQueue)) as {
                success: true
                data: { removed: boolean; queued: number }
            }
            expect(removeQueueBody.success).toBe(true)
            expect(removeQueueBody.data.removed).toBe(false)

            const suggest = await fetch(`${handle.url}/api/chat/files/suggest`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    query: 'package',
                    workspaceCwd: process.cwd(),
                    limit: 5,
                }),
            })
            expect(suggest.status).toBe(200)
            const suggestBody = (await readJson(suggest)) as {
                success: true
                data: { items: unknown[] }
            }
            expect(suggestBody.success).toBe(true)
            expect(Array.isArray(suggestBody.data.items)).toBe(true)

            const detail = await fetch(`${handle.url}/api/chat/sessions/${createdBody.data.id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            expect(detail.status).toBe(200)

            const restore = await fetch(
                `${handle.url}/api/chat/sessions/${createdBody.data.id}/history`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: 'user', content: 'hello' },
                            { role: 'assistant', content: 'hi there' },
                        ],
                    }),
                },
            )
            expect(restore.status).toBe(200)

            const compact = await fetch(
                `${handle.url}/api/chat/sessions/${createdBody.data.id}/compact`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({}),
                },
            )
            expect(compact.status).toBe(200)

            const removeHistory = await fetch(`${handle.url}/api/sessions/${createdBody.data.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            expect(removeHistory.status).toBe(200)
            const removeHistoryBody = (await readJson(removeHistory)) as {
                success: true
                data: { deleted: boolean }
            }
            expect(removeHistoryBody.success).toBe(true)
            expect(typeof removeHistoryBody.data.deleted).toBe('boolean')
        } finally {
            await handle.close()
        }
    })

    test('allows browsing directories outside current working directory', async () => {
        const outsideDir = await mkdtemp(join(tmpdir(), 'memo-http-browser-'))
        const handle = await startCoreHttpServer({
            host: '127.0.0.1',
            port: 0,
            password: 'test-password',
        })

        try {
            const login = await fetch(`${handle.url}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ password: 'test-password' }),
            })
            expect(login.status).toBe(200)
            const loginBody = (await readJson(login)) as {
                success: true
                data: { accessToken: string }
            }
            expect(loginBody.success).toBe(true)

            const listed = await fetch(
                `${handle.url}/api/workspaces/fs/list?path=${encodeURIComponent(outsideDir)}`,
                {
                    headers: {
                        Authorization: `Bearer ${loginBody.data.accessToken}`,
                    },
                },
            )
            expect(listed.status).toBe(200)

            const listedBody = (await readJson(listed)) as {
                success: true
                data: { path: string }
            }
            expect(listedBody.success).toBe(true)
            expect(listedBody.data.path).toBe(normalizePath(await realpath(outsideDir)))
        } finally {
            await handle.close()
            await rm(outsideDir, { recursive: true, force: true })
        }
    })
})
