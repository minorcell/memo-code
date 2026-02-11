import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'
import { defineMcpTool } from '@memo/tools/tools/types'

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'

const PATCH_FORMAT_HINT =
    'Format hint: start with "*** Begin Patch", include one or more file operations, then end with "*** End Patch".'

const APPLY_PATCH_INPUT_SCHEMA = z
    .object({
        input: z.string().min(1, 'patch input cannot be empty'),
    })
    .strict()

type ApplyPatchInput = z.infer<typeof APPLY_PATCH_INPUT_SCHEMA>

type UpdateFileChunk = {
    changeContext: string | null
    oldLines: string[]
    newLines: string[]
    isEndOfFile: boolean
}

type ParsedHunk =
    | { type: 'add'; path: string; contents: string }
    | { type: 'delete'; path: string }
    | { type: 'update'; path: string; moveTo: string | null; chunks: UpdateFileChunk[] }

type AffectedPaths = {
    added: string[]
    modified: string[]
    deleted: string[]
}

type Replacement = {
    start: number
    oldLen: number
    newLines: string[]
}

function withHint(message: string): string {
    return `${message} ${PATCH_FORMAT_HINT}`
}

function normalizeUnicodeForLooseMatch(input: string): string {
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

function splitLines(content: string): string[] {
    const lines = content.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

function parsePatchBoundaries(raw: string): string[] {
    const lines = raw.replace(/\r/g, '').trim().split('\n')

    if (lines.length === 0 || lines[0]?.trim() !== BEGIN_PATCH_MARKER) {
        throw new Error(withHint(`The first line of the patch must be "${BEGIN_PATCH_MARKER}".`))
    }

    if (lines[lines.length - 1]?.trim() !== END_PATCH_MARKER) {
        throw new Error(withHint(`The last line of the patch must be "${END_PATCH_MARKER}".`))
    }

    return lines
}

function parseLenientHeredoc(raw: string): string {
    const maybe = raw.trim()
    const lines = maybe.split('\n')
    if (lines.length < 4) return raw

    const first = lines[0]
    const last = lines[lines.length - 1]
    if ((first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') && last.endsWith('EOF')) {
        return lines.slice(1, -1).join('\n')
    }

    return raw
}

function parseOneUpdateChunk(
    lines: string[],
    lineNumber: number,
    allowMissingContext: boolean,
): { chunk: UpdateFileChunk; consumed: number } {
    if (lines.length === 0) {
        throw new Error(
            `Invalid patch hunk at line ${lineNumber}: update hunk does not contain any lines.`,
        )
    }

    let changeContext: string | null = null
    let startIndex = 0

    if (lines[0] === '@@') {
        startIndex = 1
    } else if ((lines[0] ?? '').startsWith('@@ ')) {
        changeContext = (lines[0] ?? '').slice(3)
        startIndex = 1
    } else if (!allowMissingContext) {
        throw new Error(
            `Invalid patch hunk at line ${lineNumber}: expected update hunk to start with "@@" or "@@ <context>", got: "${lines[0]}".`,
        )
    }

    if (startIndex >= lines.length) {
        throw new Error(
            `Invalid patch hunk at line ${lineNumber + 1}: update hunk does not contain any lines.`,
        )
    }

    const oldLines: string[] = []
    const newLines: string[] = []
    let isEndOfFile = false
    let parsedLines = 0

    for (const line of lines.slice(startIndex)) {
        if (line === EOF_MARKER) {
            if (parsedLines === 0) {
                throw new Error(
                    `Invalid patch hunk at line ${lineNumber + 1}: update hunk does not contain any lines.`,
                )
            }
            isEndOfFile = true
            parsedLines += 1
            break
        }

        if (line.length === 0) {
            oldLines.push('')
            newLines.push('')
            parsedLines += 1
            continue
        }

        const marker = line[0]
        const value = line.slice(1)

        if (marker === ' ') {
            oldLines.push(value)
            newLines.push(value)
            parsedLines += 1
            continue
        }

        if (marker === '+') {
            newLines.push(value)
            parsedLines += 1
            continue
        }

        if (marker === '-') {
            oldLines.push(value)
            parsedLines += 1
            continue
        }

        if (parsedLines === 0) {
            throw new Error(
                `Invalid patch hunk at line ${lineNumber + 1}: unexpected line "${line}". Hunk lines must start with " ", "+", or "-".`,
            )
        }

        // Assume this is the start of the next hunk.
        break
    }

    return {
        chunk: {
            changeContext,
            oldLines,
            newLines,
            isEndOfFile,
        },
        consumed: parsedLines + startIndex,
    }
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: ParsedHunk; consumed: number } {
    const firstLine = (lines[0] ?? '').trim()

    if (firstLine.startsWith(ADD_FILE_MARKER)) {
        const path = firstLine.slice(ADD_FILE_MARKER.length)
        let consumed = 1
        let contents = ''

        for (const line of lines.slice(1)) {
            if (!line.startsWith('+')) break
            contents += `${line.slice(1)}\n`
            consumed += 1
        }

        return {
            hunk: {
                type: 'add',
                path,
                contents,
            },
            consumed,
        }
    }

    if (firstLine.startsWith(DELETE_FILE_MARKER)) {
        return {
            hunk: {
                type: 'delete',
                path: firstLine.slice(DELETE_FILE_MARKER.length),
            },
            consumed: 1,
        }
    }

    if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
        const path = firstLine.slice(UPDATE_FILE_MARKER.length)
        let consumed = 1
        let remaining = lines.slice(1)

        let moveTo: string | null = null
        const maybeMove = (remaining[0] ?? '').trim()
        if (maybeMove.startsWith(MOVE_TO_MARKER)) {
            moveTo = maybeMove.slice(MOVE_TO_MARKER.length)
            remaining = remaining.slice(1)
            consumed += 1
        }

        const chunks: UpdateFileChunk[] = []
        while (remaining.length > 0) {
            if ((remaining[0] ?? '').trim().length === 0) {
                remaining = remaining.slice(1)
                consumed += 1
                continue
            }

            if ((remaining[0] ?? '').startsWith('***')) {
                break
            }

            const parsed = parseOneUpdateChunk(
                remaining,
                lineNumber + consumed,
                chunks.length === 0,
            )
            chunks.push(parsed.chunk)
            consumed += parsed.consumed
            remaining = remaining.slice(parsed.consumed)
        }

        if (chunks.length === 0) {
            throw new Error(
                `Invalid patch hunk at line ${lineNumber}: update file hunk for path "${path}" is empty.`,
            )
        }

        return {
            hunk: {
                type: 'update',
                path,
                moveTo,
                chunks,
            },
            consumed,
        }
    }

    throw new Error(
        `Invalid patch hunk at line ${lineNumber}: "${firstLine}" is not a valid hunk header.`,
    )
}

function parsePatch(raw: string): ParsedHunk[] {
    const normalized = parseLenientHeredoc(raw)
    const lines = parsePatchBoundaries(normalized)

    const hunks: ParsedHunk[] = []
    let remaining = lines.slice(1, -1)
    let lineNumber = 2

    while (remaining.length > 0) {
        if ((remaining[0] ?? '').trim().length === 0) {
            remaining = remaining.slice(1)
            lineNumber += 1
            continue
        }

        const parsed = parseOneHunk(remaining, lineNumber)
        hunks.push(parsed.hunk)
        remaining = remaining.slice(parsed.consumed)
        lineNumber += parsed.consumed
    }

    return hunks
}

function seekSequence(
    lines: string[],
    pattern: string[],
    start: number,
    eof: boolean,
): number | null {
    if (pattern.length === 0) return start
    if (pattern.length > lines.length) return null

    const maxStart = lines.length - pattern.length
    const searchStart =
        eof && lines.length >= pattern.length ? lines.length - pattern.length : start

    const runPass = (matcher: (line: string, pat: string) => boolean): number | null => {
        for (let i = searchStart; i <= maxStart; i += 1) {
            let ok = true
            for (let p = 0; p < pattern.length; p += 1) {
                const line = lines[i + p]
                const pat = pattern[p]
                if (line === undefined || pat === undefined || !matcher(line, pat)) {
                    ok = false
                    break
                }
            }
            if (ok) return i
        }
        return null
    }

    const exact = runPass((line, pat) => line === pat)
    if (exact !== null) return exact

    const trimEnd = runPass((line, pat) => line.trimEnd() === pat.trimEnd())
    if (trimEnd !== null) return trimEnd

    const trimBoth = runPass((line, pat) => line.trim() === pat.trim())
    if (trimBoth !== null) return trimBoth

    return runPass(
        (line, pat) => normalizeUnicodeForLooseMatch(line) === normalizeUnicodeForLooseMatch(pat),
    )
}

function computeReplacements(
    originalLines: string[],
    filePath: string,
    chunks: UpdateFileChunk[],
): Replacement[] {
    const replacements: Replacement[] = []
    let lineIndex = 0

    for (const chunk of chunks) {
        if (chunk.changeContext) {
            const ctx = seekSequence(originalLines, [chunk.changeContext], lineIndex, false)
            if (ctx === null) {
                throw new Error(`Failed to find context "${chunk.changeContext}" in ${filePath}`)
            }
            lineIndex = ctx + 1
        }

        if (chunk.oldLines.length === 0) {
            const insertionIdx =
                originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
                    ? originalLines.length - 1
                    : originalLines.length
            replacements.push({
                start: insertionIdx,
                oldLen: 0,
                newLines: [...chunk.newLines],
            })
            continue
        }

        let pattern = [...chunk.oldLines]
        let nextLines = [...chunk.newLines]

        let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)

        if (found === null && pattern.length > 0 && pattern[pattern.length - 1] === '') {
            pattern = pattern.slice(0, -1)
            if (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
                nextLines = nextLines.slice(0, -1)
            }
            found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile)
        }

        if (found === null) {
            throw new Error(
                `Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`,
            )
        }

        replacements.push({
            start: found,
            oldLen: pattern.length,
            newLines: nextLines,
        })
        lineIndex = found + pattern.length
    }

    replacements.sort((a, b) => a.start - b.start)
    return replacements
}

function applyReplacements(originalLines: string[], replacements: Replacement[]): string[] {
    const next = [...originalLines]

    for (const replacement of [...replacements].reverse()) {
        next.splice(replacement.start, replacement.oldLen, ...replacement.newLines)
    }

    return next
}

function ensureWritable(absPath: string) {
    const reason = writePathDenyReason(absPath)
    if (reason) {
        throw new Error(reason)
    }
}

async function deriveUpdatedContent(filePath: string, chunks: UpdateFileChunk[]): Promise<string> {
    const originalContent = await readFile(filePath, 'utf8')
    const originalLines = splitLines(originalContent)
    const replacements = computeReplacements(originalLines, filePath, chunks)
    const newLines = applyReplacements(originalLines, replacements)

    if (newLines.length === 0 || newLines[newLines.length - 1] !== '') {
        newLines.push('')
    }

    return newLines.join('\n')
}

function renderSummary(affected: AffectedPaths): string {
    const lines = ['Success. Updated the following files:']
    for (const path of affected.added) {
        lines.push(`A ${path}`)
    }
    for (const path of affected.modified) {
        lines.push(`M ${path}`)
    }
    for (const path of affected.deleted) {
        lines.push(`D ${path}`)
    }
    return lines.join('\n')
}

export const applyPatchTool = defineMcpTool<ApplyPatchInput>({
    name: 'apply_patch',
    description: `Apply file edits using Codex-style patch format.

Patch envelope:
*** Begin Patch
... one or more operations ...
*** End Patch

Operations:
1) Add file
*** Add File: path/to/file
+line

2) Delete file
*** Delete File: path/to/file

3) Update file (optional rename)
*** Update File: path/to/file
*** Move to: path/to/new-file
@@ optional context
-removed
+added
*** End of File (optional)

Hunk lines must begin with one of: " ", "+", "-".`,
    inputSchema: APPLY_PATCH_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async (input) => {
        try {
            const hunks = parsePatch(input.input)

            if (hunks.length === 0) {
                throw new Error('No files were modified.')
            }

            const affected: AffectedPaths = {
                added: [],
                modified: [],
                deleted: [],
            }

            for (const hunk of hunks) {
                if (hunk.type === 'add') {
                    const filePath = normalizePath(hunk.path)
                    ensureWritable(filePath)

                    await mkdir(dirname(filePath), { recursive: true })
                    await writeFile(filePath, hunk.contents, 'utf8')
                    affected.added.push(filePath)
                    continue
                }

                if (hunk.type === 'delete') {
                    const filePath = normalizePath(hunk.path)
                    ensureWritable(filePath)

                    await rm(filePath)
                    affected.deleted.push(filePath)
                    continue
                }

                const sourcePath = normalizePath(hunk.path)
                ensureWritable(sourcePath)

                const updatedContent = await deriveUpdatedContent(sourcePath, hunk.chunks)

                if (hunk.moveTo) {
                    const targetPath = normalizePath(hunk.moveTo)
                    ensureWritable(targetPath)

                    await mkdir(dirname(targetPath), { recursive: true })
                    await writeFile(targetPath, updatedContent, 'utf8')

                    if (targetPath !== sourcePath) {
                        await rm(sourcePath)
                    }

                    affected.modified.push(targetPath)
                } else {
                    await writeFile(sourcePath, updatedContent, 'utf8')
                    affected.modified.push(sourcePath)
                }
            }

            return textResult(renderSummary(affected))
        } catch (err) {
            const message = (err as Error).message || String(err)
            return textResult(`apply_patch failed: ${withHint(message)}`, true)
        }
    },
})
