import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'

const PATCH_MARKER_HINT =
    'Expected markers: "*** Add File:", "*** Update File:", "*** Delete File:", "*** End Patch".'
const PATCH_FORMAT_HINT =
    'Format hint: start with "*** Begin Patch", include one or more operations, and end with "*** End Patch". Update hunks use "@@" headers and body lines prefixed by " ", "+", or "-".'
const HUNK_ANCHOR_WINDOW = 2

type PatchHunk = {
    header: string
    sourceStart?: number
    lines: string[]
}

type PatchOperation =
    | { type: 'add'; file: string; lines: string[] }
    | { type: 'delete'; file: string }
    | { type: 'update'; file: string; moveTo?: string; hunks: PatchHunk[] }

const APPLY_PATCH_INPUT_SCHEMA = z
    .object({
        input: z.string().min(1, 'patch input cannot be empty'),
    })
    .strict()

type ApplyPatchInput = z.infer<typeof APPLY_PATCH_INPUT_SCHEMA>

function withFormatHint(message: string): string {
    return `${message} ${PATCH_FORMAT_HINT}`
}

function parseHunkHeader(line: string, lineNo: number): { header: string; sourceStart?: number } {
    if (/^@@\s*$/.test(line)) {
        return { header: line }
    }

    const matched = line.match(/^@@\s*-(\d+)(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@(?:\s.*)?$/)
    if (!matched) {
        throw new Error(
            withFormatHint(
                `Invalid hunk header at line ${lineNo}: "${line}". Use "@@" or "@@ -start,count +start,count @@".`,
            ),
        )
    }

    return { header: line, sourceStart: Number(matched[1]) }
}

function parsePatch(raw: string): PatchOperation[] {
    const lines = raw.replace(/\r/g, '').split('\n')
    if (lines[0] !== '*** Begin Patch') {
        throw new Error(withFormatHint('patch must start with "*** Begin Patch".'))
    }

    const operations: PatchOperation[] = []
    let i = 1
    let sawEndPatch = false

    while (i < lines.length) {
        const line = lines[i] ?? ''
        if (line === '*** End Patch') {
            sawEndPatch = true
            break
        }

        if (!line) {
            i += 1
            continue
        }

        if (line.startsWith('*** Add File: ')) {
            const file = line.slice('*** Add File: '.length).trim()
            if (!file) {
                throw new Error(withFormatHint(`Add File requires a path at line ${i + 1}.`))
            }
            i += 1
            const addLines: string[] = []
            while (i < lines.length) {
                const current = lines[i]
                if (current === undefined) break
                if (current.startsWith('*** ')) break
                if (!current.startsWith('+')) {
                    throw new Error(
                        withFormatHint(
                            `Invalid Add File content at line ${i + 1}: each content line must start with "+".`,
                        ),
                    )
                }
                addLines.push(current.slice(1))
                i += 1
            }
            operations.push({ type: 'add', file, lines: addLines })
            continue
        }

        if (line.startsWith('*** Delete File: ')) {
            const file = line.slice('*** Delete File: '.length).trim()
            if (!file) {
                throw new Error(withFormatHint(`Delete File requires a path at line ${i + 1}.`))
            }
            operations.push({ type: 'delete', file })
            i += 1
            continue
        }

        if (line.startsWith('*** Update File: ')) {
            const file = line.slice('*** Update File: '.length).trim()
            if (!file) {
                throw new Error(withFormatHint(`Update File requires a path at line ${i + 1}.`))
            }
            i += 1

            let moveTo: string | undefined
            const maybeMove = lines[i]
            if (maybeMove && maybeMove.startsWith('*** Move to: ')) {
                moveTo = maybeMove.slice('*** Move to: '.length).trim()
                i += 1
            }

            const parsedHunks: PatchHunk[] = []
            let currentHunk: PatchHunk | null = null

            while (i < lines.length) {
                const current = lines[i]
                if (current === undefined) break
                if (current.startsWith('*** ')) break

                if (current.startsWith('@@')) {
                    if (currentHunk) {
                        if (currentHunk.lines.length === 0) {
                            throw new Error(
                                withFormatHint(
                                    `Update File ${file} has an empty hunk at line ${i}.`,
                                ),
                            )
                        }
                        parsedHunks.push(currentHunk)
                    }
                    currentHunk = {
                        ...parseHunkHeader(current, i + 1),
                        lines: [],
                    }
                    i += 1
                    continue
                }

                if (current === '*** End of File') {
                    i += 1
                    continue
                }

                if (current.startsWith('+') || current.startsWith('-') || current.startsWith(' ')) {
                    if (!currentHunk) {
                        currentHunk = { header: '@@', lines: [] }
                    }
                    currentHunk.lines.push(current)
                    i += 1
                    continue
                }

                throw new Error(
                    withFormatHint(
                        `Unexpected patch line at line ${i + 1}: "${current}". Hunk lines must start with " ", "+", "-", or "@@".`,
                    ),
                )
            }

            if (currentHunk) {
                if (currentHunk.lines.length === 0) {
                    throw new Error(
                        withFormatHint(`Update File ${file} has an empty hunk near line ${i}.`),
                    )
                }
                parsedHunks.push(currentHunk)
            }
            if (parsedHunks.length === 0) {
                throw new Error(withFormatHint(`Update File ${file} has no hunks.`))
            }

            operations.push({ type: 'update', file, moveTo, hunks: parsedHunks })
            continue
        }

        throw new Error(
            withFormatHint(
                `Unexpected patch marker at line ${i + 1}: "${line}". ${PATCH_MARKER_HINT}`,
            ),
        )
    }

    if (!sawEndPatch) {
        throw new Error(withFormatHint('patch is missing "*** End Patch".'))
    }

    if (operations.length === 0) {
        throw new Error(withFormatHint('patch contains no operations.'))
    }

    return operations
}

function splitContent(content: string): { lines: string[]; trailingNewline: boolean } {
    const trailingNewline = content.endsWith('\n')
    const body = trailingNewline ? content.slice(0, -1) : content
    const lines = body.length > 0 ? body.split('\n') : []
    return { lines, trailingNewline }
}

function joinContent(lines: string[], trailingNewline: boolean): string {
    const body = lines.join('\n')
    if (trailingNewline && body.length > 0) {
        return `${body}\n`
    }
    return body
}

function findMatchingStarts(fileLines: string[], oldLines: string[]): number[] {
    if (oldLines.length === 0) return []
    const maxStart = fileLines.length - oldLines.length
    if (maxStart < 0) return []

    const starts: number[] = []
    for (let start = 0; start <= maxStart; start += 1) {
        let matched = true
        for (let offset = 0; offset < oldLines.length; offset += 1) {
            if (fileLines[start + offset] !== oldLines[offset]) {
                matched = false
                break
            }
        }
        if (matched) {
            starts.push(start)
        }
    }
    return starts
}

function resolveStartIndex(
    starts: number[],
    sourceStart: number | undefined,
    file: string,
    hunkHeader: string,
): number {
    if (starts.length === 0) {
        throw new Error(`patch hunk context not found in ${file} (header: "${hunkHeader}").`)
    }

    if (sourceStart !== undefined) {
        const expected = Math.max(0, sourceStart - 1)
        const anchored = starts.filter((idx) => Math.abs(idx - expected) <= HUNK_ANCHOR_WINDOW)

        if (anchored.length === 1) {
            return anchored[0]!
        }

        if (anchored.length > 1) {
            throw new Error(
                `patch hunk is ambiguous in ${file}: matched ${anchored.length} anchored locations near line ${sourceStart}. Add more context lines in this hunk.`,
            )
        }
    }

    if (starts.length === 1) {
        return starts[0]!
    }

    throw new Error(
        `patch hunk is ambiguous in ${file}: matched ${starts.length} locations. Add more context lines or a more accurate @@ header.`,
    )
}

function applyHunkByReplace(content: string, hunk: PatchHunk, file: string): string {
    const oldLines = hunk.lines
        .filter((line) => line.startsWith(' ') || line.startsWith('-'))
        .map((line) => line.slice(1))
    const newLines = hunk.lines
        .filter((line) => line.startsWith(' ') || line.startsWith('+'))
        .map((line) => line.slice(1))

    const split = splitContent(content)

    if (oldLines.length === 0) {
        if (newLines.length === 0) return content
        const rawInsert =
            hunk.sourceStart !== undefined ? Math.max(0, hunk.sourceStart - 1) : split.lines.length
        const insertAt = Math.min(rawInsert, split.lines.length)
        const updatedLines = [
            ...split.lines.slice(0, insertAt),
            ...newLines,
            ...split.lines.slice(insertAt),
        ]
        return joinContent(updatedLines, split.trailingNewline)
    }

    const starts = findMatchingStarts(split.lines, oldLines)
    const startIndex = resolveStartIndex(starts, hunk.sourceStart, file, hunk.header)

    const updatedLines = [
        ...split.lines.slice(0, startIndex),
        ...newLines,
        ...split.lines.slice(startIndex + oldLines.length),
    ]
    return joinContent(updatedLines, split.trailingNewline)
}

function ensureWritable(absPath: string) {
    const reason = writePathDenyReason(absPath)
    if (reason) {
        throw new Error(reason)
    }
}

export const applyPatchTool = defineMcpTool<ApplyPatchInput>({
    name: 'apply_patch',
    description: `Apply a structured patch.

Required envelope:
*** Begin Patch
...operations...
*** End Patch

Supported operations:
1) Add file
*** Add File: path/to/file.ts
+line 1
+line 2

2) Update file (with optional move)
*** Update File: path/to/file.ts
*** Move to: path/to/new-file.ts
@@ -3,2 +3,2 @@
-old line
+new line

3) Delete file
*** Delete File: path/to/file.ts

Update hunks may use "@@" or "@@ -start,count +start,count @@" headers.
Hunk body lines must start with " ", "+", or "-".`,
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
                    content = applyHunkByReplace(content, hunk, filePath)
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
