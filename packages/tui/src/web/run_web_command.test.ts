import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { startCoreHttpServerMock } = vi.hoisted(() => ({
    startCoreHttpServerMock: vi.fn(),
}))

vi.mock('@memo/core', () => ({
    startCoreHttpServer: startCoreHttpServerMock,
}))

import { runWebCommand } from './run_web_command'

async function reserveAvailablePort(): Promise<number> {
    return new Promise((resolvePort, rejectPort) => {
        const server = createServer()
        server.once('error', rejectPort)
        server.listen({ host: '127.0.0.1', port: 0 }, () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close(() => rejectPort(new Error('failed to reserve port')))
                return
            }
            const port = address.port
            server.close((error) => {
                if (error) {
                    rejectPort(error)
                    return
                }
                resolvePort(port)
            })
        })
    })
}

describe('runWebCommand', () => {
    const originalPassword = process.env.MEMO_SERVER_PASSWORD

    beforeEach(() => {
        startCoreHttpServerMock.mockReset()
    })

    afterEach(() => {
        process.env.MEMO_SERVER_PASSWORD = originalPassword
        vi.restoreAllMocks()
    })

    test('starts core server and closes on SIGTERM', async () => {
        const staticDir = await mkdtemp(join(tmpdir(), 'memo-web-static-'))
        await writeFile(join(staticDir, 'index.html'), '<!doctype html><html></html>', 'utf8')
        const preferredPort = await reserveAvailablePort()

        const closeMock = vi.fn(async () => {})
        startCoreHttpServerMock.mockResolvedValue({
            url: `http://127.0.0.1:${preferredPort}`,
            openApiSpecPath: '/api/openapi.json',
            close: closeMock,
        })

        process.env.MEMO_SERVER_PASSWORD = 'test-password'

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
            String(preferredPort),
            '--static-dir',
            staticDir,
            '--no-open',
        ])

        await vi.waitFor(() => {
            expect(startCoreHttpServerMock).toHaveBeenCalledTimes(1)
        })

        const terminate = signalHandlers.get('SIGTERM')
        expect(typeof terminate).toBe('function')
        terminate?.()

        await commandPromise

        expect(startCoreHttpServerMock).toHaveBeenCalledWith({
            host: '127.0.0.1',
            port: preferredPort,
            password: 'test-password',
            staticDir,
        })
        expect(closeMock).toHaveBeenCalledTimes(1)
        onceSpy.mockRestore()
    })
})
