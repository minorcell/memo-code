import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
    ensureCoreServerProcess,
    readCoreServerProcessInfo,
    stopCoreServerProcess,
} from './core_server_process'

const testMemoHomes: string[] = []
const testPathsToCleanup: string[] = []

function nextPreferredPort(seed: number): number {
    const base = 5600 + (process.pid % 200) * 5
    return base + seed * 30
}

async function createMemoHome(prefix: string): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), prefix))
    testMemoHomes.push(home)
    return home
}

async function createStaticDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    await writeFile(join(dir, 'index.html'), '<!doctype html><html></html>\n', 'utf8')
    testPathsToCleanup.push(dir)
    return dir
}

describe('ensureCoreServerProcess', () => {
    afterEach(async () => {
        for (const memoHome of testMemoHomes.splice(0)) {
            await stopCoreServerProcess(memoHome).catch(() => {
                // Best-effort cleanup between tests.
            })
            await rm(memoHome, { recursive: true, force: true }).catch(() => {
                // Ignore cleanup races.
            })
        }

        for (const path of testPathsToCleanup.splice(0)) {
            await rm(path, { recursive: true, force: true }).catch(() => {
                // Ignore cleanup races.
            })
        }
    })

    test('reuses existing process for the same memo home', async () => {
        const memoHome = await createMemoHome('memo-core-process-reuse-')
        const preferredPort = nextPreferredPort(1)

        const first = await ensureCoreServerProcess({
            memoHome,
            host: '127.0.0.1',
            preferredPort,
        })
        expect(first.launched).toBe(true)
        expect(first.pid).toBeGreaterThan(0)

        const second = await ensureCoreServerProcess({
            memoHome,
            host: '127.0.0.1',
            preferredPort,
        })
        expect(second.launched).toBe(false)
        expect(second.pid).toBe(first.pid)
        expect(second.baseUrl).toBe(first.baseUrl)

        const state = await readCoreServerProcessInfo(memoHome)
        expect(state?.pid).toBe(first.pid)
        expect(state?.baseUrl).toBe(first.baseUrl)
    })

    test('restarts when required static dir changes', async () => {
        const memoHome = await createMemoHome('memo-core-process-static-')
        const staticA = await createStaticDir('memo-web-static-a-')
        const staticB = await createStaticDir('memo-web-static-b-')
        const preferredPort = nextPreferredPort(2)

        const first = await ensureCoreServerProcess({
            memoHome,
            host: '127.0.0.1',
            preferredPort,
            staticDir: staticA,
            requireStaticDir: true,
        })
        expect(first.launched).toBe(true)
        expect(resolve(first.staticDir ?? '')).toBe(resolve(staticA))

        const second = await ensureCoreServerProcess({
            memoHome,
            host: '127.0.0.1',
            preferredPort,
            staticDir: staticB,
            requireStaticDir: true,
        })
        expect(second.launched).toBe(true)
        expect(resolve(second.staticDir ?? '')).toBe(resolve(staticB))
    })
})
