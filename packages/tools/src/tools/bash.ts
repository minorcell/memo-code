import { z } from 'zod'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

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

        try {
            const proc = Bun.spawn(['bash', '-lc', cmd], {
                stdout: 'pipe',
                stderr: 'pipe',
                env: process.env,
            })

            const stdoutPromise = new Response(proc.stdout).text().catch(() => '')
            const stderrPromise = new Response(proc.stderr).text().catch(() => '')

            let timeoutId: ReturnType<typeof setTimeout> | undefined

            const exitPromise = proc.exited
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

            return textResult(`exit=${exitCode} stdout="${stdout}" stderr="${stderr}"`)
        } catch (err) {
            return textResult(`bash 执行失败: ${(err as Error).message}`, true)
        }
    },
}
