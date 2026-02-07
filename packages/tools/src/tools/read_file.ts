import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath } from '@memo/tools/tools/helpers'

const MAX_LINE_LENGTH = 500
const DEFAULT_LIMIT = 200

const READ_FILE_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        mode: z.enum(['slice', 'indentation']).optional(),
        indentation: z
            .object({
                anchor_line: z.number().int().positive().optional(),
                max_levels: z.number().int().nonnegative().optional(),
                include_siblings: z.boolean().optional(),
                include_header: z.boolean().optional(),
                max_lines: z.number().int().positive().optional(),
            })
            .strict()
            .optional(),
    })
    .strict()

type ReadFileInput = z.infer<typeof READ_FILE_INPUT_SCHEMA>

type LineRecord = {
    line: number
    text: string
    indent: number
}

function clipLine(line: string): string {
    if (line.length <= MAX_LINE_LENGTH) return line
    return line.slice(0, MAX_LINE_LENGTH)
}

function countIndent(text: string): number {
    let count = 0
    for (const ch of text) {
        if (ch === ' ') {
            count += 1
        } else if (ch === '\t') {
            count += 4
        } else {
            break
        }
    }
    return count
}

function buildRecords(content: string): LineRecord[] {
    const lines = content.split(/\r?\n/)
    return lines.map((line, index) => ({
        line: index + 1,
        text: clipLine(line),
        indent: countIndent(line),
    }))
}

function formatOutput(records: LineRecord[]): string {
    return records.map((record) => `L${record.line}: ${record.text}`).join('\n')
}

function readSlice(records: LineRecord[], offset: number, limit: number): LineRecord[] {
    const start = offset - 1
    if (start >= records.length) {
        throw new Error('offset exceeds file length')
    }
    return records.slice(start, start + limit)
}

function readIndentation(records: LineRecord[], input: ReadFileInput): LineRecord[] {
    const offset = input.offset ?? 1
    const limit = input.limit ?? DEFAULT_LIMIT
    const options = input.indentation
    const anchorLine = options?.anchor_line ?? offset

    if (anchorLine <= 0 || anchorLine > records.length) {
        throw new Error('anchor_line exceeds file length')
    }

    const anchor = records[anchorLine - 1]
    if (!anchor) {
        throw new Error('anchor_line exceeds file length')
    }

    const maxLevels = options?.max_levels ?? 0
    const includeSiblings = options?.include_siblings ?? true
    const includeHeader = options?.include_header ?? true
    const maxLines = options?.max_lines ?? limit
    const hardLimit = Math.max(1, Math.min(limit, maxLines))

    const minIndent = maxLevels === 0 ? 0 : Math.max(0, anchor.indent - maxLevels * 4)

    let top = anchorLine - 1
    let bottom = anchorLine - 1

    while (top - 1 >= 0) {
        const candidate = records[top - 1]
        if (!candidate) break

        const isComment = /^\s*(#|\/\/|--)/.test(candidate.text)
        const isBlank = candidate.text.trim().length === 0

        if (candidate.indent < minIndent) break
        if (!includeSiblings && candidate.indent === minIndent && !isComment && !isBlank) break
        if (!includeHeader && (isComment || isBlank) && candidate.indent < anchor.indent) break

        top -= 1
        if (bottom - top + 1 >= hardLimit) break
    }

    while (bottom + 1 < records.length && bottom - top + 1 < hardLimit) {
        const candidate = records[bottom + 1]
        if (!candidate) break

        if (candidate.indent < minIndent) break
        if (!includeSiblings && candidate.indent === minIndent) break

        bottom += 1
    }

    return records.slice(top, bottom + 1)
}

export const readFileTool = defineMcpTool<ReadFileInput>({
    name: 'read_file',
    description:
        'Reads a local file with 1-indexed line numbers, supporting slice and indentation-aware block modes.',
    inputSchema: READ_FILE_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async (input) => {
        const offset = input.offset ?? 1
        const limit = input.limit ?? DEFAULT_LIMIT

        if (offset <= 0) {
            return textResult('offset must be a 1-indexed line number', true)
        }
        if (limit <= 0) {
            return textResult('limit must be greater than zero', true)
        }

        const rawPath = input.file_path.trim()
        if (!rawPath.startsWith('/')) {
            return textResult('file_path must be an absolute path', true)
        }

        const filePath = normalizePath(rawPath)

        try {
            const content = await readFile(filePath, 'utf8')
            const records = buildRecords(content)
            if (records.length === 0) {
                return textResult('')
            }

            const mode = input.mode ?? 'slice'
            const selected =
                mode === 'indentation'
                    ? readIndentation(records, input)
                    : readSlice(records, offset, limit)

            return textResult(formatOutput(selected))
        } catch (err) {
            return textResult(`read_file failed: ${(err as Error).message}`, true)
        }
    },
})
