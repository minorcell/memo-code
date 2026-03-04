import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { createEmbeddedCoreServerClientMock } = vi.hoisted(() => ({
    createEmbeddedCoreServerClientMock: vi.fn(),
}))

vi.mock('../http/core_server_client', () => ({
    createEmbeddedCoreServerClient: createEmbeddedCoreServerClientMock,
}))

import { runWebCommand } from './run_web_command'

describe('runWebCommand', () => {
    beforeEach(() => {
        createEmbeddedCoreServerClientMock.mockReset()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('ensures core server and exits on SIGTERM', async () => {
        const staticDir = await mkdtemp(join(tmpdir(), 'memo-web-static-'))
        await writeFile(join(staticDir, 'index.html'), '<!doctype html><html></html>', 'utf8')

        createEmbeddedCoreServerClientMock.mockResolvedValue({
            client: {},
            server: {
                url: 'http://127.0.0.1:5494',
                openApiSpecPath: '/api/openapi.json',
                close: vi.fn(async () => {}),
            },
            close: vi.fn(async () => {}),
        })

        const signalHandlers = new Map<string, () => void>()
        const onceSpy = vi.spyOn(process, 'once').mockImplementation(((event, listener) => {
            if ((event === 'SIGINT' || event === 'SIGTERM') && typeof listener === 'function') {
                signalHandlers.set(event, listener as () => void)
            }
            return process
        }) as typeof process.once)

        const commandPromise = runWebCommand([
            '--host',
            '127.0.0.1',
            '--port',
            '5494',
            '--static-dir',
            staticDir,
            '--no-open',
        ])

        await vi.waitFor(() => {
            expect(createEmbeddedCoreServerClientMock).toHaveBeenCalledTimes(1)
        })

        const terminate = signalHandlers.get('SIGTERM')
        expect(typeof terminate).toBe('function')
        terminate?.()

        await commandPromise

        expect(createEmbeddedCoreServerClientMock).toHaveBeenCalledWith({
            host: '127.0.0.1',
            preferredPort: 5494,
            memoHome: process.env.MEMO_HOME,
            staticDir,
            requireStaticDir: true,
        })
        onceSpy.mockRestore()
    })
})
