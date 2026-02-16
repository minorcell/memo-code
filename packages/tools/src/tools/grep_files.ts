import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { getRuntimeCwd } from '@memo/tools/runtime/context'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 2000
const COMMAND_TIMEOUT_MS = 30_000

const GREP_FILES_INPUT_SCHEMA = z
    .object({
        pattern: z.string().min(1),
        include: z.string().optional(),
        path: z.string().optional(),
        limit: z.number().int().positive().optional(),
    })
    .strict()

type GrepFilesInput = z.infer<typeof GREP_FILES_INPUT_SCHEMA>

function runRg(params: {
    pattern: string
    include?: string
    searchPath: string
    cwd: string
    limit: number
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const args = [
            '--files-with-matches',
            '--sortr=modified',
            '--regexp',
            params.pattern,
            '--max-count',
            '1',
            '--no-messages',
        ]
        if (params.include?.trim()) {
            args.push('--glob', params.include.trim())
        }
        args.push('--', params.searchPath)

        const proc = spawn('rg', args, {
            cwd: params.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        proc.stdout?.setEncoding('utf8')
        proc.stderr?.setEncoding('utf8')
        proc.stdout?.on('data', (chunk) => stdoutChunks.push(chunk))
        proc.stderr?.on('data', (chunk) => stderrChunks.push(chunk))

        let timedOut = false
        let killTimer: ReturnType<typeof setTimeout> | null = null
        let settled = false

        const cleanupTimers = () => {
            clearTimeout(timer)
            if (killTimer) {
                clearTimeout(killTimer)
                killTimer = null
            }
        }

        const rejectOnce = (error: Error) => {
            if (settled) return
            settled = true
            cleanupTimers()
            reject(error)
        }

        const resolveOnce = (value: { exitCode: number; stdout: string; stderr: string }) => {
            if (settled) return
            settled = true
            cleanupTimers()
            resolve(value)
        }

        const timer = setTimeout(() => {
            timedOut = true
            try {
                proc.kill('SIGTERM')
            } catch {
                // Ignore kill races.
            }
            killTimer = setTimeout(() => {
                if (proc.exitCode === null) {
                    try {
                        proc.kill('SIGKILL')
                    } catch {
                        // Ignore kill races.
                    }
                }
            }, 500)
            killTimer.unref?.()
        }, COMMAND_TIMEOUT_MS)
        timer.unref?.()

        proc.on('error', (err) => {
            rejectOnce(err as Error)
        })

        proc.on('close', (code) => {
            if (timedOut) {
                rejectOnce(new Error('rg timed out after 30 seconds'))
                return
            }
            resolveOnce({
                exitCode: typeof code === 'number' ? code : -1,
                stdout: stdoutChunks.join(''),
                stderr: stderrChunks.join(''),
            })
        })
    })
}

export const grepFilesTool = defineMcpTool<GrepFilesInput>({
    name: 'grep_files',
    description:
        'Finds files whose contents match the pattern and lists them by modification time.',
    inputSchema: GREP_FILES_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async (input) => {
        const pattern = input.pattern.trim()
        if (!pattern) {
            return textResult('pattern must not be empty', true)
        }

        const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
        const runtimeCwd = getRuntimeCwd()
        const searchPath = input.path?.trim() ? resolve(runtimeCwd, input.path.trim()) : runtimeCwd

        try {
            const result = await runRg({
                pattern,
                include: input.include,
                searchPath,
                cwd: runtimeCwd,
                limit,
            })

            if (result.exitCode === 1) {
                return textResult('No matches found.')
            }

            if (result.exitCode !== 0) {
                return textResult(`rg failed: ${result.stderr || result.stdout}`, true)
            }

            const lines = result.stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, limit)

            if (lines.length === 0) {
                return textResult('No matches found.')
            }

            return textResult(lines.join('\n'))
        } catch (err) {
            return textResult(`grep_files failed: ${(err as Error).message}`, true)
        }
    },
})
