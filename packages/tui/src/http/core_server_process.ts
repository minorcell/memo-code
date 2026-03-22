import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5494
const START_TIMEOUT_MS = 15_000
const LOCK_TIMEOUT_MS = 15_000
const STALE_LOCK_MS = 30_000

type CoreServerState = {
    version: 1
    pid: number
    host: string
    port: number
    baseUrl: string
    password: string
    memoHome?: string
    stateFile: string
    staticDir?: string
    startedAt: string
}

export type CoreServerProcessInfo = {
    baseUrl: string
    password: string
    pid: number
    staticDir?: string
    launched: boolean
}

export type EnsureCoreServerProcessOptions = {
    host?: string
    preferredPort?: number
    memoHome?: string
    staticDir?: string
    requireStaticDir?: boolean
}

type LockHandle = {
    release: () => Promise<void>
}

let ownsCleanupHook = false
const testOwnedPids = new Set<number>()

function sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => {
        setTimeout(resolveSleep, ms)
    })
}

function resolveMemoHome(explicit?: string): string {
    const input = explicit?.trim() || process.env.MEMO_HOME?.trim()
    if (input) {
        if (input === '~') {
            return homedir()
        }
        if (input.startsWith('~/')) {
            return resolve(join(homedir(), input.slice(2)))
        }
        return resolve(input)
    }

    if (process.env.VITEST) {
        return join(tmpdir(), `memo-test-home-${process.pid}`)
    }

    return join(homedir(), '.memo')
}

function resolveServerPaths(memoHome: string): {
    runtimeDir: string
    stateFile: string
    lockFile: string
} {
    const runtimeDir = join(memoHome, 'run')
    return {
        runtimeDir,
        stateFile: join(runtimeDir, 'core-server.json'),
        lockFile: join(runtimeDir, 'core-server.lock'),
    }
}

async function readServerState(stateFile: string): Promise<CoreServerState | null> {
    try {
        const raw = await readFile(stateFile, 'utf8')
        if (!raw.trim()) return null
        const parsed = JSON.parse(raw) as CoreServerState
        if (!parsed || typeof parsed !== 'object') return null
        if (typeof parsed.baseUrl !== 'string' || typeof parsed.password !== 'string') return null
        if (typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0) {
            return null
        }
        return parsed
    } catch {
        return null
    }
}

function resolveMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error || 'unknown error')
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function terminatePid(pid: number): Promise<void> {
    if (!isPidAlive(pid)) return

    try {
        process.kill(pid, 'SIGTERM')
    } catch {
        return
    }

    const deadline = Date.now() + 2_500
    while (Date.now() < deadline) {
        if (!isPidAlive(pid)) return
        await sleep(100)
    }

    try {
        process.kill(pid, 'SIGKILL')
    } catch {
        // Best-effort kill.
    }
}

async function checkLogin(state: CoreServerState): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)

    try {
        const response = await fetch(`${state.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ password: state.password }),
            signal: controller.signal,
        })

        if (!response.ok) {
            return false
        }

        const payload = (await response.json()) as {
            success?: boolean
            data?: { accessToken?: string }
        }

        return payload.success === true && typeof payload.data?.accessToken === 'string'
    } catch {
        return false
    } finally {
        clearTimeout(timer)
    }
}

async function isHealthyState(state: CoreServerState): Promise<boolean> {
    if (!isPidAlive(state.pid)) return false

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)

    try {
        const response = await fetch(`${state.baseUrl}/api/openapi.json`, {
            method: 'GET',
            signal: controller.signal,
        })

        if (!response.ok) {
            return false
        }
    } catch {
        return false
    } finally {
        clearTimeout(timer)
    }

    return checkLogin(state)
}

function findMemoPackageRoot(startDir: string): string | null {
    let current = resolve(startDir)

    while (true) {
        const packageJson = join(current, 'package.json')
        if (existsSync(packageJson)) {
            try {
                const parsed = JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: string }
                if (parsed.name === '@memo-code/memo') {
                    return current
                }
            } catch {
                // Ignore invalid package.json while traversing upward.
            }
        }

        const parent = dirname(current)
        if (parent === current) {
            return null
        }
        current = parent
    }
}

function hasFile(path: string): boolean {
    return existsSync(path)
}

export function resolveWebStaticDir(explicitPath?: string): string | null {
    const candidates: string[] = []
    if (explicitPath) {
        candidates.push(resolve(explicitPath))
    }
    if (process.env.MEMO_WEB_STATIC_DIR?.trim()) {
        candidates.push(resolve(process.env.MEMO_WEB_STATIC_DIR.trim()))
    }

    const runtimeDir = dirname(fileURLToPath(import.meta.url))
    const packageRoot = findMemoPackageRoot(runtimeDir) ?? findMemoPackageRoot(process.cwd())

    if (packageRoot) {
        candidates.push(join(packageRoot, 'dist/web/ui'))
        candidates.push(join(packageRoot, 'packages/web-ui/dist'))
    }

    candidates.push(join(process.cwd(), 'dist/web/ui'))
    candidates.push(join(process.cwd(), 'packages/web-ui/dist'))

    for (const candidate of candidates) {
        if (hasFile(join(candidate, 'index.html'))) {
            return candidate
        }
    }

    return null
}

async function acquireLock(lockFile: string): Promise<LockHandle> {
    const startedAt = Date.now()

    while (true) {
        try {
            const handle = await open(lockFile, 'wx', 0o600)
            return {
                release: async () => {
                    try {
                        await handle.close()
                    } finally {
                        await rm(lockFile, { force: true })
                    }
                },
            }
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code !== 'EEXIST') {
                throw error
            }

            try {
                const info = await stat(lockFile)
                if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
                    await rm(lockFile, { force: true })
                    continue
                }
            } catch {
                // Ignore stat/rm race.
            }

            if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
                throw new Error('Timed out waiting for core-server launch lock')
            }

            await sleep(120)
        }
    }
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
    return new Promise((resolveAvailable) => {
        const server = createServer()
        server.unref()
        server.once('error', () => resolveAvailable(false))
        server.listen({ host, port }, () => {
            server.close(() => resolveAvailable(true))
        })
    })
}

async function resolveAvailablePort(host: string, preferredPort: number): Promise<number> {
    for (let offset = 0; offset < 30; offset += 1) {
        const port = preferredPort + offset
        if (port > 65535) break
        if (await isPortAvailable(host, port)) {
            return port
        }
    }
    throw new Error(`No available port found from ${preferredPort} to ${preferredPort + 29}`)
}

function resolveServerCommand(): { command: string; args: string[] } {
    const runtimeDir = dirname(fileURLToPath(import.meta.url))
    const packageRoot = findMemoPackageRoot(runtimeDir) ?? findMemoPackageRoot(process.cwd())

    if (!packageRoot) {
        throw new Error('Cannot resolve memo package root for core-server launcher')
    }

    const distEntry = join(packageRoot, 'dist/core-server.js')
    if (existsSync(distEntry)) {
        return {
            command: process.execPath,
            args: [distEntry],
        }
    }

    const tsEntry = join(packageRoot, 'packages/core/src/server/process_entry.ts')
    const tsxCli = join(packageRoot, 'node_modules/tsx/dist/cli.mjs')

    if (existsSync(tsEntry) && existsSync(tsxCli)) {
        return {
            command: process.execPath,
            args: [tsxCli, tsEntry],
        }
    }

    throw new Error('core-server launcher entry not found (dist/core-server.js missing)')
}

function registerTestCleanupHook(): void {
    if (!process.env.VITEST) return
    if (ownsCleanupHook) return

    ownsCleanupHook = true
    process.once('exit', () => {
        for (const pid of testOwnedPids) {
            try {
                process.kill(pid, 'SIGTERM')
            } catch {
                // Ignore already-terminated process.
            }
        }
    })
}

async function launchCoreServerProcess(options: {
    host: string
    port: number
    memoHome: string
    stateFile: string
    password: string
    staticDir?: string
}): Promise<void> {
    const command = resolveServerCommand()
    const args = [
        ...command.args,
        '--host',
        options.host,
        '--port',
        String(options.port),
        '--memo-home',
        options.memoHome,
        '--state-file',
        options.stateFile,
    ]

    if (options.staticDir) {
        args.push('--static-dir', options.staticDir)
    }

    const child = spawn(command.command, args, {
        stdio: 'ignore',
        detached: !process.env.VITEST,
        env: {
            ...process.env,
            MEMO_SERVER_PASSWORD: options.password,
        },
    })

    if (typeof child.pid === 'number' && child.pid > 0 && process.env.VITEST) {
        registerTestCleanupHook()
        testOwnedPids.add(child.pid)
    }

    if (!process.env.VITEST) {
        child.unref()
    }
}

function toInfo(state: CoreServerState, launched: boolean): CoreServerProcessInfo {
    return {
        baseUrl: state.baseUrl,
        password: state.password,
        pid: state.pid,
        staticDir: state.staticDir,
        launched,
    }
}

async function waitForHealthyState(stateFile: string): Promise<CoreServerState> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < START_TIMEOUT_MS) {
        const current = await readServerState(stateFile)
        if (current && (await isHealthyState(current))) {
            return current
        }
        await sleep(150)
    }

    throw new Error('Timed out waiting for core-server process to become ready')
}

async function cleanupState(
    stateFile: string,
    state: CoreServerState | null,
    options: { terminateProcess?: boolean } = {},
): Promise<void> {
    if (options.terminateProcess && state && isPidAlive(state.pid)) {
        await terminatePid(state.pid)
    }
    await rm(stateFile, { force: true })
}

function needsRestartForStatic(
    state: CoreServerState,
    staticDir: string | undefined,
    requireStaticDir: boolean,
): boolean {
    if (!requireStaticDir) return false
    if (!staticDir) return false
    if (!state.staticDir) return true
    return resolve(state.staticDir) !== resolve(staticDir)
}

export async function ensureCoreServerProcess(
    options: EnsureCoreServerProcessOptions = {},
): Promise<CoreServerProcessInfo> {
    const host = options.host?.trim() || DEFAULT_HOST
    const preferredPort =
        typeof options.preferredPort === 'number' && Number.isInteger(options.preferredPort)
            ? options.preferredPort
            : DEFAULT_PORT

    const memoHome = resolveMemoHome(options.memoHome)
    const staticDir = resolveWebStaticDir(options.staticDir)
    const requireStaticDir = options.requireStaticDir ?? false

    if (requireStaticDir && !staticDir) {
        throw new Error('web-ui static assets not found (index.html missing)')
    }

    const paths = resolveServerPaths(memoHome)
    await mkdir(paths.runtimeDir, { recursive: true })

    const existing = await readServerState(paths.stateFile)
    if (existing && (await isHealthyState(existing))) {
        if (!needsRestartForStatic(existing, staticDir ?? undefined, requireStaticDir)) {
            return toInfo(existing, false)
        }
    }

    const lock = await acquireLock(paths.lockFile)
    try {
        const current = await readServerState(paths.stateFile)
        if (current && (await isHealthyState(current))) {
            if (!needsRestartForStatic(current, staticDir ?? undefined, requireStaticDir)) {
                return toInfo(current, false)
            }
            await cleanupState(paths.stateFile, current, { terminateProcess: true })
        } else if (current) {
            await cleanupState(paths.stateFile, current)
        }

        const port = await resolveAvailablePort(host, preferredPort)
        await launchCoreServerProcess({
            host,
            port,
            memoHome,
            stateFile: paths.stateFile,
            password: randomUUID(),
            staticDir: staticDir ?? undefined,
        })

        const ready = await waitForHealthyState(paths.stateFile)
        return toInfo(ready, true)
    } catch (error) {
        throw new Error(`Failed to ensure core-server process: ${resolveMessage(error)}`)
    } finally {
        await lock.release()
    }
}

export async function readCoreServerProcessInfo(
    memoHomeInput?: string,
): Promise<CoreServerProcessInfo | null> {
    const memoHome = resolveMemoHome(memoHomeInput)
    const paths = resolveServerPaths(memoHome)
    const current = await readServerState(paths.stateFile)
    if (!current) return null
    if (!(await isHealthyState(current))) return null
    return toInfo(current, false)
}

export async function stopCoreServerProcess(memoHomeInput?: string): Promise<boolean> {
    const memoHome = resolveMemoHome(memoHomeInput)
    const paths = resolveServerPaths(memoHome)
    const state = await readServerState(paths.stateFile)
    if (!state) {
        await rm(paths.stateFile, { force: true })
        return false
    }

    await cleanupState(paths.stateFile, state)
    return true
}
