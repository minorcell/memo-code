import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'

const DEFAULT_EXEC_YIELD_TIME_MS = 10_000
const DEFAULT_WRITE_YIELD_TIME_MS = 250
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000
const MAX_SESSIONS = 64

type StartExecRequest = {
    cmd: string
    workdir?: string
    shell?: string
    login?: boolean
    tty?: boolean
    yield_time_ms?: number
    max_output_tokens?: number
}

type WriteStdinRequest = {
    session_id: number
    chars?: string
    yield_time_ms?: number
    max_output_tokens?: number
}

type SessionState = {
    id: number
    output: string
    readOffset: number
    startedAtMs: number
    exited: boolean
    exitCode: number | null
    eventBus: EventEmitter
    proc: ReturnType<typeof spawn>
}

type SessionResponse = {
    sessionId: number
    chunkId: string
    wallTimeSeconds: number
    exitCode: number | null
    output: string
    originalTokenCount: number
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

function formatChunkId() {
    const raw = Math.random().toString(16).slice(2)
    return raw || String(Date.now())
}

function toShellInvocation(params: { cmd: string; shell?: string; login: boolean }): {
    file: string
    args: string[]
} {
    const login = params.login
    const shell = params.shell?.trim()

    if (process.platform === 'win32') {
        const chosen = shell || 'powershell.exe'
        if (chosen.toLowerCase().includes('powershell')) {
            return {
                file: chosen,
                args: ['-NoProfile', '-Command', params.cmd],
            }
        }
        return {
            file: chosen,
            args: [login ? '-lc' : '-c', params.cmd],
        }
    }

    const chosen = shell || process.env.SHELL || '/bin/bash'
    return {
        file: chosen,
        args: [login ? '-lc' : '-c', params.cmd],
    }
}

function truncateByTokens(text: string, maxOutputTokens?: number) {
    const maxTokens =
        typeof maxOutputTokens === 'number' && maxOutputTokens > 0
            ? Math.floor(maxOutputTokens)
            : DEFAULT_MAX_OUTPUT_TOKENS

    const maxChars = maxTokens * 4
    const originalTokenCount = estimateTokens(text)

    if (text.length <= maxChars) {
        return {
            output: text,
            originalTokenCount,
        }
    }

    return {
        output: text.slice(0, maxChars),
        originalTokenCount,
    }
}

function formatSessionResponse(response: SessionResponse): string {
    const sections: string[] = []
    sections.push(`Chunk ID: ${response.chunkId}`)
    sections.push(`Wall time: ${response.wallTimeSeconds.toFixed(4)} seconds`)
    if (response.exitCode !== null) {
        sections.push(`Process exited with code ${response.exitCode}`)
    } else {
        sections.push(`Process running with session ID ${response.sessionId}`)
    }
    sections.push(`Original token count: ${response.originalTokenCount}`)
    sections.push('Output:')
    sections.push(response.output)
    return sections.join('\n')
}

function clampYield(input: number | undefined, fallback: number): number {
    if (typeof input !== 'number' || Number.isNaN(input)) return fallback
    if (input < 0) return 0
    return Math.floor(input)
}

async function waitForWindow(session: SessionState, yieldMs: number): Promise<void> {
    if (yieldMs <= 0 || session.exited) return
    await Promise.race([
        new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                cleanup()
                resolve()
            }, yieldMs)
            const onExit = () => {
                clearTimeout(timer)
                cleanup()
                resolve()
            }
            const cleanup = () => {
                session.eventBus.off('exit', onExit)
            }
            session.eventBus.on('exit', onExit)
        }),
    ])
}

class UnifiedExecManager {
    private sessions = new Map<number, SessionState>()
    private nextId = 1

    private cleanupSessions() {
        if (this.sessions.size <= MAX_SESSIONS) return
        const ended = Array.from(this.sessions.values())
            .filter((session) => session.exited)
            .sort((a, b) => a.startedAtMs - b.startedAtMs)

        for (const session of ended) {
            if (this.sessions.size <= MAX_SESSIONS) break
            this.sessions.delete(session.id)
        }
    }

    async start(request: StartExecRequest): Promise<string> {
        const cmd = request.cmd.trim()
        if (!cmd) {
            throw new Error('cmd must not be empty')
        }

        const id = this.nextId++
        const startedAtMs = Date.now()
        const shellInvocation = toShellInvocation({
            cmd,
            shell: request.shell,
            login: request.login !== false,
        })

        const cwd = request.workdir?.trim()
            ? resolve(process.cwd(), request.workdir.trim())
            : process.cwd()

        const proc = spawn(shellInvocation.file, shellInvocation.args, {
            cwd,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
        })

        const session: SessionState = {
            id,
            output: '',
            readOffset: 0,
            startedAtMs,
            exited: false,
            exitCode: null,
            eventBus: new EventEmitter(),
            proc,
        }

        const append = (prefix: string, chunk: Buffer | string) => {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
            session.output += prefix ? `${prefix}${text}` : text
            session.eventBus.emit('output')
        }

        proc.stdout?.on('data', (chunk) => append('', chunk))
        proc.stderr?.on('data', (chunk) => append('', chunk))
        proc.on('error', (err) => {
            session.output += `\n[exec error] ${(err as Error).message}`
            session.eventBus.emit('output')
        })
        proc.on('close', (code) => {
            session.exited = true
            session.exitCode = typeof code === 'number' ? code : -1
            session.eventBus.emit('exit')
        })

        this.sessions.set(id, session)
        this.cleanupSessions()

        const yieldMs = clampYield(request.yield_time_ms, DEFAULT_EXEC_YIELD_TIME_MS)
        await waitForWindow(session, yieldMs)

        return this.buildResponseText(session, request.max_output_tokens)
    }

    async write(request: WriteStdinRequest): Promise<string> {
        const session = this.sessions.get(request.session_id)
        if (!session) {
            throw new Error(`session_id ${request.session_id} not found`)
        }

        if (!session.exited && request.chars && request.chars.length > 0) {
            session.proc.stdin?.write(request.chars)
        }

        const yieldMs = clampYield(request.yield_time_ms, DEFAULT_WRITE_YIELD_TIME_MS)
        await waitForWindow(session, yieldMs)

        return this.buildResponseText(session, request.max_output_tokens)
    }

    private buildResponseText(session: SessionState, maxOutputTokens?: number): string {
        const delta = session.output.slice(session.readOffset)
        session.readOffset = session.output.length
        const truncated = truncateByTokens(delta, maxOutputTokens)

        const payload: SessionResponse = {
            sessionId: session.id,
            chunkId: formatChunkId(),
            wallTimeSeconds: (Date.now() - session.startedAtMs) / 1000,
            exitCode: session.exited ? session.exitCode : null,
            output: truncated.output,
            originalTokenCount: truncated.originalTokenCount,
        }

        return formatSessionResponse(payload)
    }
}

const singleton = new UnifiedExecManager()

export async function startExecSession(request: StartExecRequest): Promise<string> {
    return singleton.start(request)
}

export async function writeExecSession(request: WriteStdinRequest): Promise<string> {
    return singleton.write(request)
}
