import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startCoreHttpServer } from '@memo/core'
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

export async function runWebCommand(argv: string[]): Promise<void> {
    const options = parseWebArgs(argv)
    const host = options.host ?? DEFAULT_HOST
    const preferredPort = options.port ?? DEFAULT_PORT
    const port = await resolveAvailablePort(host, preferredPort)

    const staticDir = resolveWebStaticDir(options.staticDir)
    if (!staticDir) {
        console.error('web-ui static assets not found (index.html missing).')
        console.error('Please run `pnpm run web:ui:build` or `pnpm run build` first.')
        process.exitCode = 1
        return
    }

    const password = process.env.MEMO_SERVER_PASSWORD?.trim()
    if (!password) {
        console.error('MEMO_SERVER_PASSWORD is required for `memo web`.')
        console.error('Example: MEMO_SERVER_PASSWORD=your-password memo web')
        process.exitCode = 1
        return
    }

    if (port !== preferredPort) {
        console.log(`[memo web] Port ${preferredPort} is busy, using ${port}`)
    }

    let handle: Awaited<ReturnType<typeof startCoreHttpServer>> | null = null
    try {
        handle = await startCoreHttpServer({
            host,
            port,
            password,
            staticDir,
        })
    } catch (error) {
        console.error(`Failed to start core server: ${(error as Error).message}`)
        process.exitCode = 1
        return
    }

    const url = handle.url || formatAddress(host, port)
    console.log(`[memo web] Server: ${url}`)
    console.log(`[memo web] Static: ${staticDir}`)
    console.log(`[memo web] OpenAPI: ${url}${handle.openApiSpecPath}`)

    if (options.open && !openBrowser(url)) {
        console.warn(`[memo web] Failed to auto-open browser. Open manually: ${url}`)
    }

    const shutdown = async () => {
        if (!handle) return
        const toClose = handle
        handle = null
        await toClose.close()
    }

    await new Promise<void>((resolveDone) => {
        const onSignal = (signal: NodeJS.Signals) => {
            void shutdown()
                .catch((error) => {
                    console.error(
                        `Failed to stop core server on ${signal}: ${(error as Error).message}`,
                    )
                    process.exitCode = 1
                })
                .finally(() => resolveDone())
        }

        process.once('SIGINT', () => onSignal('SIGINT'))
        process.once('SIGTERM', () => onSignal('SIGTERM'))
    })
}
