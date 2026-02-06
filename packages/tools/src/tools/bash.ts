import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, isWritePathAllowed } from '@memo/tools/tools/helpers'

const BASH_INPUT_SCHEMA = z
    .object({
        command: z.string().min(1, 'command 不能为空'),
        timeout: z
            .number()
            .int('timeout 必须是整数毫秒')
            .positive('timeout 必须大于 0')
            .max(60 * 60 * 1000, 'timeout 不能超过 1 小时')
            .optional(),
    })
    .strict()

type BashInput = z.infer<typeof BASH_INPUT_SCHEMA>
const MAX_STDOUT_CHARS = 4_000
const MAX_STDERR_CHARS = 4_000

function truncateOutput(text: string, maxChars: number) {
    if (text.length <= maxChars) return { value: text, truncated: false }
    return { value: text.slice(0, maxChars), truncated: true }
}

function stripShellToken(raw: string) {
    return raw.trim().replace(/^['"]|['"]$/g, '')
}

function findOutOfSandboxAbsolutePaths(command: string) {
    const tokens = command.split(/\s+/).map(stripShellToken).filter(Boolean)
    const outOfScope: string[] = []
    for (const token of tokens) {
        if (!token.startsWith('/')) continue
        const normalized = normalizePath(token)
        if (!isWritePathAllowed(normalized)) {
            outOfScope.push(normalized)
        }
    }
    return Array.from(new Set(outOfScope))
}

/**
 * 执行任意 bash 命令，将 exit/stdout/stderr 拼接返回。
 * 主要用于调试/脚本执行，注意命令安全性需由上层控制。
 */
export const bashTool: McpTool<BashInput> = {
    name: 'bash',
    description: '在 shell 中执行命令，返回 exit/stdout/stderr',
    inputSchema: BASH_INPUT_SCHEMA,
    execute: async ({ command, timeout }) => {
        const cmd = command.trim()
        if (!cmd) return textResult('bash 需要要执行的命令', true)
        const deniedPaths = findOutOfSandboxAbsolutePaths(cmd)
        if (deniedPaths.length > 0) {
            return textResult(
                `sandbox 拒绝执行: 命令包含越界绝对路径 (${deniedPaths.join(', ')})`,
                true,
            )
        }

        try {
            const proc = spawn('bash', ['-lc', cmd], {
                env: process.env,
                stdio: ['ignore', 'pipe', 'pipe'],
            })

            const collectStream = (stream: NodeJS.ReadableStream | null) =>
                new Promise<string>((resolve) => {
                    if (!stream) return resolve('')
                    const chunks: string[] = []
                    stream.setEncoding('utf8')
                    stream.on('data', (chunk) => chunks.push(chunk))
                    stream.on('error', () => resolve(''))
                    stream.on('end', () => resolve(chunks.join('')))
                })

            const stdoutPromise = collectStream(proc.stdout)
            const stderrPromise = collectStream(proc.stderr)

            let timeoutId: ReturnType<typeof setTimeout> | undefined

            const exitPromise = new Promise<number>((resolve, reject) => {
                proc.on('error', (error) => reject(error))
                proc.on('close', (code) => resolve(typeof code === 'number' ? code : -1))
            })
            const timeoutPromise =
                timeout && timeout > 0
                    ? new Promise<never>((_, reject) => {
                          timeoutId = setTimeout(() => {
                              proc.kill()
                              reject(new Error(`bash 超时 ${timeout}ms，已终止进程`))
                          }, timeout)
                      })
                    : null

            const exitCode = timeoutPromise
                ? await Promise.race([exitPromise, timeoutPromise])
                : await exitPromise

            if (timeoutId) clearTimeout(timeoutId)

            const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

            const stdoutLimited = truncateOutput(stdout, MAX_STDOUT_CHARS)
            const stderrLimited = truncateOutput(stderr, MAX_STDERR_CHARS)
            const truncatedHint =
                stdoutLimited.truncated || stderrLimited.truncated
                    ? `\n<system_hint>bash 输出已截断（stdout_max=${MAX_STDOUT_CHARS} chars, stderr_max=${MAX_STDERR_CHARS} chars）。请缩小命令输出范围。</system_hint>`
                    : ''

            return textResult(
                `exit=${exitCode} stdout="${stdoutLimited.value}" stderr="${stderrLimited.value}"${truncatedHint}`,
            )
        } catch (err) {
            return textResult(`bash 执行失败: ${(err as Error).message}`, true)
        }
    },
}
