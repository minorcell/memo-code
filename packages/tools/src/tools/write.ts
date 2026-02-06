import { z } from 'zod'
import { dirname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const WRITE_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        // 使用 z.any() 允许任意类型，实际类型检查在 execute 中进行
        // Uint8Array/ArrayBuffer 无法被 JSON Schema 表达
        content: z.any().optional(),
    })
    .strict()

type WriteInput = z.infer<typeof WRITE_INPUT_SCHEMA>

function normalizeContent(raw: WriteInput['content']): { data: string | Uint8Array; info: string } {
    if (raw instanceof Uint8Array) {
        return { data: raw, info: `bytes=${raw.byteLength}` }
    }
    if (raw instanceof ArrayBuffer) {
        const bytes = new Uint8Array(raw)
        return { data: bytes, info: `bytes=${bytes.byteLength}` }
    }
    if (typeof raw === 'string') {
        return { data: raw, info: `text_length=${raw.length}` }
    }
    const json = JSON.stringify(raw ?? '', null, 2)
    return { data: json, info: `json_length=${json.length}` }
}

/** 覆盖写入文件内容，必要时递归创建父目录。 */
export const writeTool: McpTool<WriteInput> = {
    name: 'write',
    description: '创建或覆盖文件，传入 file_path 与 content',
    inputSchema: WRITE_INPUT_SCHEMA,
    execute: async (input) => {
        const path = normalizePath(input.file_path)
        const denyReason = writePathDenyReason(path)
        if (denyReason) {
            return textResult(denyReason, true)
        }
        const { data, info } = normalizeContent(input.content)
        try {
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, data instanceof Uint8Array ? data : String(data))
            return textResult(`已写入 ${path} (overwrite, ${info})`)
        } catch (err) {
            return textResult(`写入失败: ${(err as Error).message}`, true)
        }
    },
}
