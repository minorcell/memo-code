import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { startExecSession } from '@memo/tools/tools/exec_runtime'

const SHELL_INPUT_SCHEMA = z
    .object({
        command: z.array(z.string().min(1)).min(1, 'command 不能为空'),
        workdir: z.string().optional(),
        timeout_ms: z.number().int().positive().optional(),
        sandbox_permissions: z.enum(['use_default', 'require_escalated']).optional(),
        justification: z.string().optional(),
        prefix_rule: z.array(z.string().min(1)).optional(),
    })
    .strict()

type ShellInput = z.infer<typeof SHELL_INPUT_SCHEMA>

function shellJoin(argv: string[]) {
    return argv
        .map((part) => {
            if (/^[A-Za-z0-9_./:@%+-]+$/.test(part)) return part
            return JSON.stringify(part)
        })
        .join(' ')
}

export const shellTool = defineMcpTool<ShellInput>({
    name: 'shell',
    description: 'Runs a shell command (argv form) and returns output.',
    inputSchema: SHELL_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: true,
    execute: async ({ command, workdir, timeout_ms }) => {
        try {
            const content = await startExecSession({
                cmd: shellJoin(command),
                workdir,
                login: false,
                yield_time_ms: timeout_ms,
            })
            return textResult(content)
        } catch (err) {
            return textResult(`shell failed: ${(err as Error).message}`, true)
        }
    },
})
