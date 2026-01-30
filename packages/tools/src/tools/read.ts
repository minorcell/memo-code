import { z } from 'zod'
import { normalizePath } from '@memo/tools/tools/helpers'
import type { McpTool } from './types'
import { textResult } from '@memo/tools/tools/mcp'

const MAX_BYTES = 512_000
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1_000
const BINARY_PROBE_LENGTH = 1024

const READ_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
    })
    .strict()

type ReadInput = z.infer<typeof READ_INPUT_SCHEMA>

export const readTool: McpTool<ReadInput> = {
    name: 'read',
    description: '读取指定文件内容，可按 offset/limit 截取并附带行号',
    inputSchema: READ_INPUT_SCHEMA,
    execute: async (input) => {
        const path = normalizePath(input.file_path)
        const offset = input.offset ?? 1
        const requestedLimit = input.limit ?? DEFAULT_LIMIT
        const limit = Math.min(requestedLimit, MAX_LIMIT)

        try {
            const file = Bun.file(path)
            if (!(await file.exists())) {
                return textResult(`文件不存在: ${path}`, true)
            }

            // 大文件与二进制防护
            const size = file.size
            if (size > MAX_BYTES) {
                return textResult(
                    `文件过大（${size} bytes），已拒绝读取，阈值 ${MAX_BYTES} bytes`,
                    true,
                )
            }

            const probe = new Uint8Array(await file.arrayBuffer())
            const probeLength = Math.min(probe.length, BINARY_PROBE_LENGTH)
            for (let i = 0; i < probeLength; i++) {
                if (probe[i] === 0) {
                    return textResult('检测到二进制内容，已拒绝直接读取', true)
                }
            }

            const content = new TextDecoder().decode(probe)
            const lines = content.split(/\r?\n/)
            const startIdx = Math.max(0, offset - 1)
            const endIdx = Math.min(lines.length, startIdx + limit)
            const sliced = lines.slice(startIdx, endIdx)
            const withNumbers = sliced.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n')
            const hasMore = endIdx < lines.length
            const capped = requestedLimit !== limit
            const truncated = capped || (hasMore && input.limit === undefined)
            const note = truncated
                ? `\n... (truncated, showing ${limit} lines; max=${MAX_LIMIT})`
                : ''
            return textResult(withNumbers + note)
        } catch (err) {
            return textResult(`读取失败: ${(err as Error).message}`, true)
        }
    },
}
