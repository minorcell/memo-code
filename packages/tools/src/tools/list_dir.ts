import { readdir, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath } from '@memo/tools/tools/helpers'

const DEFAULT_OFFSET = 1
const DEFAULT_LIMIT = 25
const DEFAULT_DEPTH = 2

type QueueEntry = {
    absPath: string
    depth: number
    displayDepth: number
}

type ListedEntry = {
    path: string
    displayDepth: number
    kind: 'dir' | 'file' | 'symlink' | 'other'
}

const LIST_DIR_INPUT_SCHEMA = z
    .object({
        dir_path: z.string().min(1),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        depth: z.number().int().positive().optional(),
    })
    .strict()

type ListDirInput = z.infer<typeof LIST_DIR_INPUT_SCHEMA>

function formatLine(entry: ListedEntry) {
    const indent = ' '.repeat(entry.displayDepth * 2)
    let suffix = ''
    if (entry.kind === 'dir') suffix = '/'
    if (entry.kind === 'symlink') suffix = '@'
    if (entry.kind === 'other') suffix = '?'

    const parts = entry.path.split('/')
    const name = parts[parts.length - 1] ?? entry.path
    return `${indent}${name}${suffix}`
}

export const listDirTool = defineMcpTool<ListDirInput>({
    name: 'list_dir',
    description:
        'Lists entries in a local directory with 1-indexed entry numbers and simple type labels.',
    inputSchema: LIST_DIR_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async (input) => {
        const offset = input.offset ?? DEFAULT_OFFSET
        const limit = input.limit ?? DEFAULT_LIMIT
        const depth = input.depth ?? DEFAULT_DEPTH

        if (offset <= 0) {
            return textResult('offset must be a 1-indexed entry number', true)
        }
        if (limit <= 0) {
            return textResult('limit must be greater than zero', true)
        }
        if (depth <= 0) {
            return textResult('depth must be greater than zero', true)
        }

        const rawPath = input.dir_path.trim()
        if (!rawPath.startsWith('/')) {
            return textResult('dir_path must be an absolute path', true)
        }

        const root = normalizePath(rawPath)

        try {
            const queue: QueueEntry[] = [{ absPath: root, depth, displayDepth: 0 }]
            const entries: ListedEntry[] = []

            while (queue.length > 0) {
                const current = queue.shift()
                if (!current) continue

                const names = await readdir(current.absPath)
                names.sort((a, b) => a.localeCompare(b))

                for (const name of names) {
                    const absPath = join(current.absPath, name)
                    const stat = await lstat(absPath)
                    const kind: ListedEntry['kind'] = stat.isSymbolicLink()
                        ? 'symlink'
                        : stat.isDirectory()
                          ? 'dir'
                          : stat.isFile()
                            ? 'file'
                            : 'other'
                    entries.push({
                        path: absPath,
                        displayDepth: current.displayDepth,
                        kind,
                    })

                    if (kind === 'dir' && current.depth > 1) {
                        queue.push({
                            absPath,
                            depth: current.depth - 1,
                            displayDepth: current.displayDepth + 1,
                        })
                    }
                }
            }

            if (entries.length === 0) {
                return textResult(`Absolute path: ${root}`)
            }

            const start = offset - 1
            if (start >= entries.length) {
                return textResult('offset exceeds directory entry count', true)
            }

            const selected = entries.slice(start, start + limit)
            const lines = [`Absolute path: ${root}`, ...selected.map(formatLine)]
            if (start + limit < entries.length) {
                lines.push(`More than ${limit} entries found`)
            }
            return textResult(lines.join('\n'))
        } catch (err) {
            return textResult(`list_dir failed: ${(err as Error).message}`, true)
        }
    },
})
