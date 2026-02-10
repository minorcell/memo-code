import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'

type PatchOperation =
    | { type: 'add'; file: string; lines: string[] }
    | { type: 'delete'; file: string }
    | { type: 'update'; file: string; moveTo?: string; hunks: string[][] }

const APPLY_PATCH_INPUT_SCHEMA = z
    .object({
        input: z.string().min(1, 'patch input cannot be empty'),
    })
    .strict()

type ApplyPatchInput = z.infer<typeof APPLY_PATCH_INPUT_SCHEMA>

function parsePatch(raw: string): PatchOperation[] {
    const lines = raw.replace(/\r/g, '').split('\n')
    if (lines[0] !== '*** Begin Patch') {
        throw new Error('patch must start with *** Begin Patch')
    }

    const operations: PatchOperation[] = []
    let i = 1

    while (i < lines.length) {
        const line = lines[i] ?? ''
        if (line === '*** End Patch') {
            break
        }

        if (!line) {
            i += 1
            continue
        }

        if (line.startsWith('*** Add File: ')) {
            const file = line.slice('*** Add File: '.length).trim()
            if (!file) throw new Error('Add File requires a path')
            i += 1
            const addLines: string[] = []
            while (i < lines.length) {
                const current = lines[i]
                if (current === undefined) break
                if (current.startsWith('*** ')) break
                if (!current.startsWith('+')) {
                    throw new Error('Add File lines must start with +')
                }
                addLines.push(current.slice(1))
                i += 1
            }
            operations.push({ type: 'add', file, lines: addLines })
            continue
        }

        if (line.startsWith('*** Delete File: ')) {
            const file = line.slice('*** Delete File: '.length).trim()
            if (!file) throw new Error('Delete File requires a path')
            operations.push({ type: 'delete', file })
            i += 1
            continue
        }

        if (line.startsWith('*** Update File: ')) {
            const file = line.slice('*** Update File: '.length).trim()
            if (!file) throw new Error('Update File requires a path')
            i += 1

            let moveTo: string | undefined
            const maybeMove = lines[i]
            if (maybeMove && maybeMove.startsWith('*** Move to: ')) {
                moveTo = maybeMove.slice('*** Move to: '.length).trim()
                i += 1
            }

            const hunks: string[][] = []
            let currentHunk: string[] = []

            while (i < lines.length) {
                const current = lines[i]
                if (current === undefined) break
                if (current.startsWith('*** ')) break

                if (current.startsWith('@@')) {
                    if (currentHunk.length > 0) {
                        hunks.push(currentHunk)
                        currentHunk = []
                    }
                    i += 1
                    continue
                }

                if (current === '*** End of File') {
                    i += 1
                    continue
                }

                if (current.startsWith('+') || current.startsWith('-') || current.startsWith(' ')) {
                    currentHunk.push(current)
                    i += 1
                    continue
                }

                throw new Error(`Unexpected patch line: ${current}`)
            }

            if (currentHunk.length > 0) {
                hunks.push(currentHunk)
            }
            if (hunks.length === 0) {
                throw new Error(`Update File ${file} has no hunks`)
            }

            operations.push({ type: 'update', file, moveTo, hunks })
            continue
        }

        throw new Error(`Unexpected patch marker: ${line}`)
    }

    if (operations.length === 0) {
        throw new Error('patch contains no operations')
    }

    return operations
}

function applyHunkByReplace(content: string, hunk: string[]): string {
    const oldChunk = hunk
        .filter((line) => line.startsWith(' ') || line.startsWith('-'))
        .map((line) => line.slice(1))
        .join('\n')
    const newChunk = hunk
        .filter((line) => line.startsWith(' ') || line.startsWith('+'))
        .map((line) => line.slice(1))
        .join('\n')

    if (!oldChunk) {
        if (!newChunk) return content
        if (!content) return newChunk
        const separator = content.endsWith('\n') ? '' : '\n'
        return `${content}${separator}${newChunk}`
    }

    const idx = content.indexOf(oldChunk)
    if (idx < 0) {
        throw new Error('patch hunk context not found in target file')
    }

    return `${content.slice(0, idx)}${newChunk}${content.slice(idx + oldChunk.length)}`
}

function ensureWritable(absPath: string) {
    const reason = writePathDenyReason(absPath)
    if (reason) {
        throw new Error(reason)
    }
}

export const applyPatchTool = defineMcpTool<ApplyPatchInput>({
    name: 'apply_patch',
    description:
        'Apply a structured patch with Add/Update/Delete operations and hunk-based replacements.',
    inputSchema: APPLY_PATCH_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async (input) => {
        try {
            const operations = parsePatch(input.input)

            for (const op of operations) {
                if (op.type === 'add') {
                    const filePath = normalizePath(op.file)
                    ensureWritable(filePath)
                    await mkdir(dirname(filePath), { recursive: true })
                    await writeFile(filePath, op.lines.join('\n'), 'utf8')
                    continue
                }

                if (op.type === 'delete') {
                    const filePath = normalizePath(op.file)
                    ensureWritable(filePath)
                    await rm(filePath)
                    continue
                }

                const filePath = normalizePath(op.file)
                ensureWritable(filePath)
                let content = await readFile(filePath, 'utf8')
                for (const hunk of op.hunks) {
                    content = applyHunkByReplace(content, hunk)
                }

                if (op.moveTo) {
                    const targetPath = normalizePath(op.moveTo)
                    ensureWritable(targetPath)
                    await mkdir(dirname(targetPath), { recursive: true })
                    await writeFile(targetPath, content, 'utf8')
                    if (targetPath !== filePath) {
                        await rm(filePath)
                    }
                } else {
                    await writeFile(filePath, content, 'utf8')
                }
            }

            return textResult(`apply_patch succeeded (${operations.length} operations)`)
        } catch (err) {
            return textResult(`apply_patch failed: ${(err as Error).message}`, true)
        }
    },
})
