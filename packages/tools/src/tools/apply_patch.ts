import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'
import { defineMcpTool } from '@memo/tools/tools/types'

const PATCH_MARKER_HINT =
    'Expected markers: "*** Add File:", "*** Update File:", "*** Delete File:", "*** End Patch".'
const PATCH_FORMAT_HINT =
    'Format hint: start with "*** Begin Patch", include one or more operations, and end with "*** End Patch". Update hunks use "@@" headers and body lines prefixed by " ", "+", or "-".'
const HUNK_ANCHOR_WINDOW = 2

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const END_OF_FILE_MARKER = '*** End of File'

type PatchHunk = {
    header: string
    sourceStart?: number
    contextHint?: string
    lines: string[]
    isEndOfFile: boolean
}

type PatchOperation =
    | { type: 'add'; file: string; lines: string[] }
    | { type: 'delete'; file: string }
    | { type: 'update'; file: string; moveTo?: string; hunks: PatchHunk[] }

type MatchMode = 'exact' | 'trim_end' | 'trim' | 'normalized'

const APPLY_PATCH_INPUT_SCHEMA = z
    .object({
        input: z.string().min(1, 'patch input cannot be empty'),
    })
    .strict()

type ApplyPatchInput = z.infer<typeof APPLY_PATCH_INPUT_SCHEMA>

function withFormatHint(message: string): string {
    return `${message} ${PATCH_FORMAT_HINT}`
}

function trimLine(value: string): string {
    return value.trim()
}

function extractMarkerValue(line: string, marker: string): string | null {
    if (!line.startsWith(marker)) return null
    const value = line.slice(marker.length).trim()
    return value.length > 0 ? value : null
}

function parseHunkHeader(
    line: string,
    lineNo: number,
): { header: string; sourceStart?: number; contextHint?: string } {
    if (line === '@@') {
        return { header: line }
    }

    const numbered = line.match(/^@@\s*-(\d+)(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@(?:\s*(.*))?$/)
    if (numbered) {
        const contextHint = numbered[2]?.trim()
        return {
            header: line,
            sourceStart: Number(numbered[1]),
            contextHint: contextHint ? contextHint : undefined,
        }
    }

    if (line.startsWith('@@ ')) {
        const contextHint = line.slice(3).trim()
        return {
            header: line,
            contextHint: contextHint ? contextHint : undefined,
        }
    }

    throw new Error(
        withFormatHint(
            `Invalid hunk header at line ${lineNo}: "${line}". Use "@@", "@@ <context>", or "@@ -start,count +start,count @@".`,
        ),
    )
}

function parsePatch(raw: string): PatchOperation[] {
    const lines = raw.replace(/\r/g, '').split('\n')
    if (trimLine(lines[0] ?? '') !== BEGIN_PATCH_MARKER) {
        throw new Error(withFormatHint('patch must start with "*** Begin Patch".'))
    }

    const operations: PatchOperation[] = []
    let i = 1
    let sawEndPatch = false

    while (i < lines.length) {
        const rawLine = lines[i] ?? ''
        const line = trimLine(rawLine)

        if (line === END_PATCH_MARKER) {
            sawEndPatch = true
            break
        }

        if (!line) {
            i += 1
            continue
        }

        const addFile = extractMarkerValue(line, ADD_FILE_MARKER)
        if (addFile !== null) {
            i += 1
            const addLines: string[] = []

            while (i < lines.length) {
                const currentRaw = lines[i]
                if (currentRaw === undefined) break
                if (trimLine(currentRaw).startsWith('*** ')) break
                if (!currentRaw.startsWith('+')) {
                    throw new Error(
                        withFormatHint(
                            `Invalid Add File content at line ${i + 1}: each content line must start with "+".`,
                        ),
                    )
                }
                addLines.push(currentRaw.slice(1))
                i += 1
            }

            operations.push({ type: 'add', file: addFile, lines: addLines })
            continue
        }

        const deleteFile = extractMarkerValue(line, DELETE_FILE_MARKER)
        if (deleteFile !== null) {
            operations.push({ type: 'delete', file: deleteFile })
            i += 1
            continue
        }

        const updateFile = extractMarkerValue(line, UPDATE_FILE_MARKER)
        if (updateFile !== null) {
            i += 1

            let moveTo: string | undefined
            const moveLine = trimLine(lines[i] ?? '')
            const moveValue = extractMarkerValue(moveLine, MOVE_TO_MARKER)
            if (moveValue !== null) {
                moveTo = moveValue
                i += 1
            }

            const hunks: PatchHunk[] = []
            let currentHunk: PatchHunk | null = null

            while (i < lines.length) {
                const currentRaw = lines[i]
                if (currentRaw === undefined) break
                const current = trimLine(currentRaw)

                if (!current) {
                    i += 1
                    continue
                }

                if (current === END_OF_FILE_MARKER) {
                    if (!currentHunk) {
                        currentHunk = {
                            header: '@@',
                            lines: [],
                            isEndOfFile: true,
                        }
                    } else {
                        currentHunk.isEndOfFile = true
                    }
                    i += 1
                    continue
                }

                if (current.startsWith('*** ')) break

                if (current.startsWith('@@')) {
                    if (currentHunk) {
                        if (currentHunk.lines.length === 0) {
                            throw new Error(
                                withFormatHint(
                                    `Update File ${updateFile} has an empty hunk at line ${i}.`,
                                ),
                            )
                        }
                        hunks.push(currentHunk)
                    }

                    currentHunk = {
                        ...parseHunkHeader(current, i + 1),
                        lines: [],
                        isEndOfFile: false,
                    }
                    i += 1
                    continue
                }

                if (
                    currentRaw.startsWith('+') ||
                    currentRaw.startsWith('-') ||
                    currentRaw.startsWith(' ')
                ) {
                    if (!currentHunk) {
                        currentHunk = {
                            header: '@@',
                            lines: [],
                            isEndOfFile: false,
                        }
                    }
                    currentHunk.lines.push(currentRaw)
                    i += 1
                    continue
                }

                throw new Error(
                    withFormatHint(
                        `Unexpected patch line at line ${i + 1}: "${currentRaw}". Hunk lines must start with " ", "+", "-", or "@@".`,
                    ),
                )
            }

            if (currentHunk) {
                if (currentHunk.lines.length === 0) {
                    throw new Error(
                        withFormatHint(
                            `Update File ${updateFile} has an empty hunk near line ${i}.`,
                        ),
                    )
                }
                hunks.push(currentHunk)
            }

            if (hunks.length === 0) {
                throw new Error(withFormatHint(`Update File ${updateFile} has no hunks.`))
            }

            operations.push({ type: 'update', file: updateFile, moveTo, hunks })
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

function joinContent(
    lines: string[],
    trailingNewline: boolean,
    options: { forceTrailingNewline?: boolean } = {},
): string {
    const body = lines.join('\n')
    if (body.length === 0) return ''
    if (options.forceTrailingNewline || trailingNewline) {
        return `${body}\n`
    }
    return body
}

function normalizeLineForLooseMatch(input: string): string {
    return input
        .trim()
        .split('')
        .map((char) => {
            if (
                char === '\u2010' ||
                char === '\u2011' ||
                char === '\u2012' ||
                char === '\u2013' ||
                char === '\u2014' ||
                char === '\u2015' ||
                char === '\u2212'
            ) {
                return '-'
            }
            if (char === '\u2018' || char === '\u2019' || char === '\u201A' || char === '\u201B') {
                return "'"
            }
            if (char === '\u201C' || char === '\u201D' || char === '\u201E' || char === '\u201F') {
                return '"'
            }
            if (
                char === '\u00A0' ||
                char === '\u2002' ||
                char === '\u2003' ||
                char === '\u2004' ||
                char === '\u2005' ||
                char === '\u2006' ||
                char === '\u2007' ||
                char === '\u2008' ||
                char === '\u2009' ||
                char === '\u200A' ||
                char === '\u202F' ||
                char === '\u205F' ||
                char === '\u3000'
            ) {
                return ' '
            }
            return char
        })
        .join('')
}

function linesEqual(fileLine: string, patchLine: string, mode: MatchMode): boolean {
    switch (mode) {
        case 'exact':
            return fileLine === patchLine
        case 'trim_end':
            return fileLine.trimEnd() === patchLine.trimEnd()
        case 'trim':
            return fileLine.trim() === patchLine.trim()
        case 'normalized':
            return normalizeLineForLooseMatch(fileLine) === normalizeLineForLooseMatch(patchLine)
        default:
            return false
    }
}

function buildSearchPositions(maxStart: number, startIndex: number, preferEnd: boolean): number[] {
    if (maxStart < 0) return []

    const start = Math.max(0, Math.min(startIndex, maxStart))
    const positions: number[] = []
    const seen = new Set<number>()

    const push = (value: number) => {
        if (value < start || value > maxStart || seen.has(value)) return
        seen.add(value)
        positions.push(value)
    }

    if (preferEnd) {
        push(maxStart)
    }

    for (let idx = start; idx <= maxStart; idx += 1) {
        push(idx)
    }

    return positions
}

function findMatchingStarts(
    fileLines: string[],
    oldLines: string[],
    options: { startIndex?: number; preferEnd?: boolean } = {},
): number[] {
    if (oldLines.length === 0) return []

    const maxStart = fileLines.length - oldLines.length
    if (maxStart < 0) return []

    const positions = buildSearchPositions(
        maxStart,
        options.startIndex ?? 0,
        options.preferEnd ?? false,
    )
    const modes: MatchMode[] = ['exact', 'trim_end', 'trim', 'normalized']

    for (const mode of modes) {
        const matches: number[] = []

        for (const start of positions) {
            let matched = true
            for (let offset = 0; offset < oldLines.length; offset += 1) {
                const fileLine = fileLines[start + offset]
                const patchLine = oldLines[offset]
                if (
                    fileLine === undefined ||
                    patchLine === undefined ||
                    !linesEqual(fileLine, patchLine, mode)
                ) {
                    matched = false
                    break
                }
            }
            if (matched) {
                matches.push(start)
            }
        }

        if (matches.length > 0) {
            return matches
        }
    }

    return []
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

function resolveContextStartIndex(fileLines: string[], hunk: PatchHunk, file: string): number {
    if (!hunk.contextHint) {
        return 0
    }

    const matches = findMatchingStarts(fileLines, [hunk.contextHint], {
        preferEnd: hunk.isEndOfFile,
    })
    if (matches.length === 0) {
        throw new Error(
            `patch hunk context not found in ${file} (header: "${hunk.header}", context: "${hunk.contextHint}").`,
        )
    }

    if (matches.length > 1) {
        throw new Error(
            `patch hunk context is ambiguous in ${file}: matched ${matches.length} locations for "${hunk.contextHint}".`,
        )
    }

    return matches[0]! + 1
}

function applyHunkByReplace(content: string, hunk: PatchHunk, file: string): string {
    const oldLines = hunk.lines
        .filter((line) => line.startsWith(' ') || line.startsWith('-'))
        .map((line) => line.slice(1))
    const newLines = hunk.lines
        .filter((line) => line.startsWith(' ') || line.startsWith('+'))
        .map((line) => line.slice(1))

    const split = splitContent(content)
    const contextStart = resolveContextStartIndex(split.lines, hunk, file)

    if (oldLines.length === 0) {
        if (newLines.length === 0) return content

        let insertAt = split.lines.length
        if (hunk.sourceStart !== undefined) {
            insertAt = Math.max(0, hunk.sourceStart - 1)
        }
        if (hunk.isEndOfFile) {
            insertAt = split.lines.length
        }

        insertAt = Math.min(Math.max(insertAt, contextStart), split.lines.length)

        const updatedLines = [
            ...split.lines.slice(0, insertAt),
            ...newLines,
            ...split.lines.slice(insertAt),
        ]

        return joinContent(updatedLines, split.trailingNewline, { forceTrailingNewline: true })
    }

    const starts = findMatchingStarts(split.lines, oldLines, {
        startIndex: contextStart,
        preferEnd: hunk.isEndOfFile,
    })
    const startIndex = resolveStartIndex(starts, hunk.sourceStart, file, hunk.header)

    const updatedLines = [
        ...split.lines.slice(0, startIndex),
        ...newLines,
        ...split.lines.slice(startIndex + oldLines.length),
    ]

    return joinContent(updatedLines, split.trailingNewline, { forceTrailingNewline: true })
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

Update hunks may use "@@", "@@ <context>", or "@@ -start,count +start,count @@" headers.
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
                    const content = op.lines.length > 0 ? `${op.lines.join('\n')}\n` : ''
                    await writeFile(filePath, content, 'utf8')
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
