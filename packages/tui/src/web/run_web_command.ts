import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWebArgs } from './cli_web_args'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5494

type BrowserCommand = {
    command: string
    args: string[]
}

function findMemoPackageRoot(startDir: string): string | null {
    let dir = resolve(startDir)
    while (true) {
        const pkgPath = join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
                if (pkg.name === '@memo-code/memo') return dir
            } catch {
                // ignore and keep walking
            }
        }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return null
}

function hasFile(path: string): boolean {
    return existsSync(path)
}

function resolveServerEntry(explicitPath?: string): string | null {
    const candidates: string[] = []
    if (explicitPath) candidates.push(resolve(explicitPath))
    if (process.env.MEMO_WEB_SERVER_ENTRY) {
        candidates.push(resolve(process.env.MEMO_WEB_SERVER_ENTRY))
    }

    const runtimeDir = dirname(fileURLToPath(import.meta.url))
    const packageRoot = findMemoPackageRoot(runtimeDir) ?? findMemoPackageRoot(process.cwd())
    if (packageRoot) {
        candidates.push(join(packageRoot, 'dist/web/server/main.cjs'))
        candidates.push(join(packageRoot, 'dist/web/server/main.js'))
        candidates.push(join(packageRoot, 'packages/web-server/dist/main.cjs'))
        candidates.push(join(packageRoot, 'packages/web-server/dist/main.js'))
    }

    candidates.push(join(process.cwd(), 'dist/web/server/main.cjs'))
    candidates.push(join(process.cwd(), 'dist/web/server/main.js'))
    candidates.push(join(process.cwd(), 'packages/web-server/dist/main.cjs'))
    candidates.push(join(process.cwd(), 'packages/web-server/dist/main.js'))

    for (const candidate of candidates) {
        if (hasFile(candidate)) return candidate
    }
    return null
}

function resolveWebStaticDir(explicitPath?: string): string | null {
    const candidates: string[] = []
    if (explicitPath) candidates.push(resolve(explicitPath))
    if (process.env.MEMO_WEB_STATIC_DIR) {
        candidates.push(resolve(process.env.MEMO_WEB_STATIC_DIR))
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
        if (hasFile(join(candidate, 'index.html'))) return candidate
    }
    return null
}

function resolveTaskPromptsDir(): string {
    const runtimeDir = dirname(fileURLToPath(import.meta.url))
    const packageRoot = findMemoPackageRoot(runtimeDir) ?? findMemoPackageRoot(process.cwd())
    const candidates: string[] = []
    if (packageRoot) {
        candidates.push(join(packageRoot, 'dist/task-prompts'))
        candidates.push(join(packageRoot, 'packages/tui/src/task-prompts'))
    }
    candidates.push(resolve(runtimeDir, '../task-prompts'))
    candidates.push(resolve(runtimeDir, 'task-prompts'))

    for (const candidate of candidates) {
        if (hasFile(join(candidate, 'init_agents.md'))) return candidate
    }

    return candidates[0] ?? resolve(runtimeDir, '../task-prompts')
}

function resolveSystemPromptPath(): string | null {
    const runtimeDir = dirname(fileURLToPath(import.meta.url))
    const packageRoot = findMemoPackageRoot(runtimeDir) ?? findMemoPackageRoot(process.cwd())
    const candidates: string[] = []
    if (process.env.MEMO_SYSTEM_PROMPT_PATH) {
        candidates.push(resolve(process.env.MEMO_SYSTEM_PROMPT_PATH))
    }
    if (packageRoot) {
        candidates.push(join(packageRoot, 'dist/prompt.md'))
        candidates.push(join(packageRoot, 'packages/core/src/runtime/prompt.md'))
    }
    candidates.push(resolve(runtimeDir, '../prompt.md'))
    candidates.push(resolve(runtimeDir, '../../core/src/runtime/prompt.md'))

    for (const candidate of candidates) {
        if (hasFile(candidate)) return candidate
    }

    return null
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
    for (let offset = 0; offset < 30; offset++) {
        const port = preferredPort + offset
        if (port > 65535) break
        if (await isPortAvailable(host, port)) return port
    }
    throw new Error(`No available port found from ${preferredPort} to ${preferredPort + 29}`)
}

function buildBrowserCommand(url: string, platform: NodeJS.Platform): BrowserCommand | null {
    if (platform === 'darwin') {
        return { command: 'open', args: [url] }
    }
    if (platform === 'win32') {
        return { command: 'cmd', args: ['/c', 'start', '', url] }
    }
    if (platform === 'linux') {
        return { command: 'xdg-open', args: [url] }
    }
    return null
}

function openBrowser(url: string): boolean {
    const command = buildBrowserCommand(url, process.platform)
    if (!command) return false
    try {
        const child = spawn(command.command, command.args, {
            stdio: 'ignore',
            detached: true,
        })
        child.unref()
        return true
    } catch {
        return false
    }
}

function formatAddress(host: string, port: number): string {
    const safeHost = host.includes(':') ? `[${host}]` : host
    return `http://${safeHost}:${port}`
}

async function waitForServer(host: string, port: number, timeoutMs = 8000): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        if (!(await isPortAvailable(host, port))) {
            return true
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
    }
    return false
}

export async function runWebCommand(argv: string[]): Promise<void> {
    const options = parseWebArgs(argv)
    const host = options.host ?? DEFAULT_HOST
    const preferredPort = options.port ?? DEFAULT_PORT
    const port = await resolveAvailablePort(host, preferredPort)

    const serverEntry = resolveServerEntry()
    if (!serverEntry) {
        console.error('web-server entry not found (main.js missing).')
        console.error('Please run `pnpm run web:server:build` or `pnpm run build` first.')
        process.exitCode = 1
        return
    }

    const staticDir = resolveWebStaticDir(options.staticDir)
    if (!staticDir) {
        console.error('web-ui static assets not found (index.html missing).')
        console.error('Please run `pnpm run web:ui:build` or `pnpm run build` first.')
        process.exitCode = 1
        return
    }

    if (port !== preferredPort) {
        console.log(`[memo web] Port ${preferredPort} is busy, using ${port}`)
    }
    const url = formatAddress(host, port)
    console.log(`[memo web] Server: ${url}`)
    console.log(`[memo web] Entry: ${serverEntry}`)
    console.log(`[memo web] Static: ${staticDir}`)
    const taskPromptsDir = resolveTaskPromptsDir()
    const systemPromptPath = resolveSystemPromptPath()

    const child = spawn(process.execPath, [serverEntry], {
        stdio: 'inherit',
        env: {
            ...process.env,
            MEMO_WEB_HOST: host,
            MEMO_WEB_PORT: String(port),
            MEMO_WEB_STATIC_DIR: staticDir,
            MEMO_CLI_ENTRY: process.argv[1],
            MEMO_TASK_PROMPTS_DIR: taskPromptsDir,
            ...(systemPromptPath ? { MEMO_SYSTEM_PROMPT_PATH: systemPromptPath } : {}),
        },
    })

    if (options.open) {
        const ready = await waitForServer(host, port)
        if (!ready || !openBrowser(url)) {
            console.warn(`[memo web] Failed to auto-open browser. Open manually: ${url}`)
        }
    }

    const forwardSignal = (signal: NodeJS.Signals) => {
        if (!child.killed) child.kill(signal)
    }

    process.once('SIGINT', () => {
        forwardSignal('SIGINT')
    })
    process.once('SIGTERM', () => {
        forwardSignal('SIGTERM')
    })

    await new Promise<void>((resolve) => {
        child.once('exit', (code, signal) => {
            if (signal) {
                process.exitCode = 0
                resolve()
                return
            }
            process.exitCode = code ?? 0
            resolve()
        })
    })
}
