import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { startCoreHttpServer, type CoreHttpServerHandle } from './http_server'

type ProcessArgs = {
    host: string
    port: number
    memoHome?: string
    stateFile: string
    staticDir?: string
}

type ServerState = {
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

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5494

function parseArgs(argv: string[]): ProcessArgs {
    let host = DEFAULT_HOST
    let port = DEFAULT_PORT
    let memoHome: string | undefined
    let stateFile: string | undefined
    let staticDir: string | undefined

    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index]
        if (!current) continue

        if (current === '--host') {
            const next = argv[index + 1]
            if (!next) throw new Error('Missing value for --host')
            host = next
            index += 1
            continue
        }

        if (current === '--port') {
            const next = argv[index + 1]
            if (!next) throw new Error('Missing value for --port')
            const parsed = Number.parseInt(next, 10)
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
                throw new Error('Invalid --port value')
            }
            port = parsed
            index += 1
            continue
        }

        if (current === '--memo-home') {
            const next = argv[index + 1]
            if (!next) throw new Error('Missing value for --memo-home')
            memoHome = next
            index += 1
            continue
        }

        if (current === '--state-file') {
            const next = argv[index + 1]
            if (!next) throw new Error('Missing value for --state-file')
            stateFile = next
            index += 1
            continue
        }

        if (current === '--static-dir') {
            const next = argv[index + 1]
            if (!next) throw new Error('Missing value for --static-dir')
            staticDir = next
            index += 1
            continue
        }

        throw new Error(`Unknown argument: ${current}`)
    }

    const normalizedStateFile = stateFile?.trim()
    if (!normalizedStateFile) {
        const runtimeDir = memoHome ? join(memoHome, 'run') : join(process.cwd(), '.memo', 'run')
        stateFile = join(runtimeDir, 'core-server.json')
    }

    return {
        host,
        port,
        memoHome,
        stateFile: stateFile!,
        staticDir,
    }
}

async function writeState(stateFile: string, state: ServerState): Promise<void> {
    const directory = dirname(stateFile)
    await mkdir(directory, { recursive: true })

    const tempFile = `${stateFile}.tmp-${process.pid}`
    await writeFile(tempFile, `${JSON.stringify(state, null, 2)}\n`, {
        mode: 0o600,
        encoding: 'utf8',
    })
    await rm(stateFile, { force: true })
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, {
        mode: 0o600,
        encoding: 'utf8',
    })
    await rm(tempFile, { force: true })
}

async function removeStateFile(path: string): Promise<void> {
    await rm(path, { force: true })
}

async function run(): Promise<void> {
    const args = parseArgs(process.argv.slice(2))
    const password = process.env.MEMO_SERVER_PASSWORD?.trim()

    if (!password) {
        throw new Error('MEMO_SERVER_PASSWORD is required for core server process')
    }

    let handle: CoreHttpServerHandle | null = null
    let shuttingDown = false

    const shutdown = async (reason: string) => {
        if (shuttingDown) return
        shuttingDown = true

        try {
            if (handle) {
                const current = handle
                handle = null
                await current.close()
            }
        } finally {
            await removeStateFile(args.stateFile)
            if (reason) {
                process.stderr.write(`[core-server] stopped: ${reason}\n`)
            }
        }
    }

    process.on('SIGINT', () => {
        void shutdown('SIGINT').finally(() => process.exit(0))
    })
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM').finally(() => process.exit(0))
    })

    process.on('uncaughtException', (error) => {
        process.stderr.write(`[core-server] uncaughtException: ${String(error)}\n`)
        void shutdown('uncaughtException').finally(() => process.exit(1))
    })
    process.on('unhandledRejection', (error) => {
        process.stderr.write(`[core-server] unhandledRejection: ${String(error)}\n`)
        void shutdown('unhandledRejection').finally(() => process.exit(1))
    })

    handle = await startCoreHttpServer({
        host: args.host,
        port: args.port,
        password,
        memoHome: args.memoHome,
        staticDir: args.staticDir,
    })

    const parsed = new URL(handle.url)
    const state: ServerState = {
        version: 1,
        pid: process.pid,
        host: parsed.hostname,
        port: Number.parseInt(parsed.port, 10),
        baseUrl: handle.url,
        password,
        memoHome: args.memoHome,
        stateFile: args.stateFile,
        staticDir: args.staticDir,
        startedAt: new Date().toISOString(),
    }
    await writeState(args.stateFile, state)

    await new Promise<void>(() => {
        // Keep process alive until a signal triggers shutdown.
    })
}

void run().catch((error) => {
    process.stderr.write(`[core-server] failed: ${(error as Error).message}\n`)
    process.exit(1)
})
