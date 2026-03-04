import { spawn } from 'node:child_process'
import { parseWebArgs } from './cli_web_args'
import { createEmbeddedCoreServerClient } from '../http/core_server_client'
import { resolveWebStaticDir } from '../http/core_server_process'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5494

type BrowserCommand = {
    command: string
    args: string[]
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

export async function runWebCommand(argv: string[]): Promise<void> {
    const options = parseWebArgs(argv)
    const host = options.host ?? DEFAULT_HOST
    const preferredPort = options.port ?? DEFAULT_PORT

    const staticDir = resolveWebStaticDir(options.staticDir)
    if (!staticDir) {
        console.error('web-ui static assets not found (index.html missing).')
        console.error('Please run `pnpm run web:ui:build` or `pnpm run build` first.')
        process.exitCode = 1
        return
    }

    let clientHandle: Awaited<ReturnType<typeof createEmbeddedCoreServerClient>> | null = null
    try {
        clientHandle = await createEmbeddedCoreServerClient({
            host,
            preferredPort,
            memoHome: process.env.MEMO_HOME,
            staticDir,
            requireStaticDir: true,
        })
    } catch (error) {
        console.error(`Failed to ensure core server: ${(error as Error).message}`)
        process.exitCode = 1
        return
    }

    const url = clientHandle.server.url
    console.log(`[memo web] Server: ${url}`)
    console.log(`[memo web] Static: ${staticDir}`)
    console.log(`[memo web] OpenAPI: ${url}${clientHandle.server.openApiSpecPath}`)

    if (options.open && !openBrowser(url)) {
        console.warn(`[memo web] Failed to auto-open browser. Open manually: ${url}`)
    }

    await new Promise<void>((resolveDone) => {
        const onSignal = () => {
            resolveDone()
        }

        process.once('SIGINT', onSignal)
        process.once('SIGTERM', onSignal)
    })
}
