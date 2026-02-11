import assert from 'node:assert'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { applyPatchTool } from '@memo/tools/tools/apply_patch'

let tempDir: string
let prevWritableRoots: string | undefined

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function readText(path: string) {
    try {
        await access(path)
        return await readFile(path, 'utf8')
    } catch {
        return ''
    }
}

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

async function runPatch(input: string) {
    return applyPatchTool.execute({ input })
}

function assertPatchOk(result: {
    isError?: boolean
    content?: Array<{ type: string; text?: string }>
}) {
    const payload = textPayload(result)
    assert.ok(!result.isError, payload)
}

function assertPatchError(
    result: { isError?: boolean; content?: Array<{ type: string; text?: string }> },
    includes?: string,
) {
    assert.strictEqual(result.isError, true)
    if (includes) {
        assert.ok(textPayload(result).includes(includes), textPayload(result))
    }
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-apply-patch')
    prevWritableRoots = process.env.MEMO_SANDBOX_WRITABLE_ROOTS
    process.env.MEMO_SANDBOX_WRITABLE_ROOTS = tempDir
})

afterAll(async () => {
    if (prevWritableRoots === undefined) {
        delete process.env.MEMO_SANDBOX_WRITABLE_ROOTS
    } else {
        process.env.MEMO_SANDBOX_WRITABLE_ROOTS = prevWritableRoots
    }
    await rm(tempDir, { recursive: true, force: true })
})

describe('apply_patch tool', () => {
    test('rejects malformed patch header', async () => {
        const result = await runPatch('*** Bad Patch\n')
        assertPatchError(result, 'patch must start with')
    })

    test('returns line-aware parser error hints for unknown markers', async () => {
        const patch = `*** Begin Patch\n*** Unknown Op: x\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
        const text = textPayload(result)
        assert.ok(text.includes('line 2'))
        assert.ok(text.includes('Expected markers'))
        assert.ok(text.includes('Format hint'))
    })

    test('fails when patch is missing end marker', async () => {
        const patch = `*** Begin Patch\n*** Add File: ${join(tempDir, 'missing-end.txt')}\n+x`
        const result = await runPatch(patch)
        assertPatchError(result, 'missing "*** End Patch"')
    })

    test('fails when patch contains no operations', async () => {
        const result = await runPatch('*** Begin Patch\n*** End Patch\n')
        assertPatchError(result, 'contains no operations')
    })

    test('rejects add-file content lines without + prefix', async () => {
        const target = join(tempDir, 'invalid-add.txt')
        const patch = `*** Begin Patch\n*** Add File: ${target}\nnot-prefixed\n*** End Patch\n`
        const result = await runPatch(patch)
        assertPatchError(result, 'must start with "+"')
    })

    test('accepts add file with no + lines as empty file', async () => {
        const target = join(tempDir, 'empty-add.txt')
        const patch = `*** Begin Patch\n*** Add File: ${target}\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), '')
    })

    test('supports move + update in one operation', async () => {
        const source = join(tempDir, 'source.txt')
        const target = join(tempDir, 'nested', 'target.txt')
        await writeFile(source, 'hello old', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${target}\n@@\n-hello old\n+hello new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(source), '')
        assert.strictEqual(await readText(target), 'hello new\n')
    })

    test('supports move to same path without deleting file', async () => {
        const target = join(tempDir, 'move-same-path.txt')
        await writeFile(target, 'old', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n*** Move to: ${target}\n@@\n-old\n+new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'new\n')
    })

    test('supports move that overwrites existing destination', async () => {
        const source = join(tempDir, 'move-overwrite-source.txt')
        const target = join(tempDir, 'move-overwrite-target.txt')
        await writeFile(source, 'from-source', 'utf8')
        await writeFile(target, 'from-target', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${target}\n@@\n-from-source\n+from-source-updated\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(source), '')
        assert.strictEqual(await readText(target), 'from-source-updated\n')
    })

    test('keeps source unchanged when move target is denied by sandbox', async () => {
        const source = join(tempDir, 'move-denied-source.txt')
        const deniedTarget = '/tmp/memo-tools-move-denied-target.txt'
        await writeFile(source, 'keep-me', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${deniedTarget}\n@@\n-keep-me\n+changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'sandbox')
        assert.strictEqual(await readText(source), 'keep-me')
    })

    test('fails when hunk context does not exist', async () => {
        const target = join(tempDir, 'context-miss.txt')
        await writeFile(target, 'line-a\nline-b', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-line-x\n+line-y\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'context not found')
    })

    test('fails fast when hunk context is ambiguous', async () => {
        const target = join(tempDir, 'context-ambiguous.txt')
        await writeFile(target, 'a\nrepeat\nb\nrepeat\nc\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-repeat\n+changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'ambiguous')
        const text = textPayload(result)
        assert.ok(text.includes('Add more context'))
    })

    test('uses @@ line anchor to select nearby unique match', async () => {
        const target = join(tempDir, 'anchored-match.txt')
        await writeFile(target, 'line-1\nrepeat\nline-3\nline-4\nrepeat\nline-6\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ -5,1 +5,1 @@\n-repeat\n+anchored\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        const updated = await readText(target)
        assert.strictEqual(updated, 'line-1\nrepeat\nline-3\nline-4\nanchored\nline-6\n')
    })

    test('reports anchored ambiguity when multiple matches are near source line', async () => {
        const target = join(tempDir, 'anchored-ambiguous.txt')
        await writeFile(target, 'a\nx\nb\nx\nc\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ -3,1 +3,1 @@\n-x\n+y\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'anchored locations')
    })

    test('falls back to context match when @@ anchor is inaccurate', async () => {
        const target = join(tempDir, 'anchor-fallback.txt')
        await writeFile(target, 'before\nonly-once\nafter\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ -99,1 +99,1 @@\n-only-once\n+still-updated\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'before\nstill-updated\nafter\n')
    })

    test('supports @@ <context> hint to target match after context line', async () => {
        const target = join(tempDir, 'context-header-targeted.txt')
        await writeFile(target, 'alpha\ntarget\nbeta\ntarget\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ beta\n-target\n+selected\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'alpha\ntarget\nbeta\nselected\n')
    })

    test('fails when @@ <context> is missing in file', async () => {
        const target = join(tempDir, 'context-header-missing.txt')
        await writeFile(target, 'a\ntarget\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ missing-context\n-target\n+changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'context not found')
    })

    test('fails when @@ <context> is ambiguous in file', async () => {
        const target = join(tempDir, 'context-header-ambiguous.txt')
        await writeFile(target, 'same\na\nsame\nb\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ same\n-a\n+changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'context is ambiguous')
    })

    test('accepts whitespace-padded patch markers', async () => {
        const target = join(tempDir, 'whitespace-padded.txt')
        const patch = `  *** Begin Patch \n*** Add File: ${target}\n+hello from padded marker\n*** End Patch   \n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'hello from padded marker\n')
    })

    test('accepts whitespace-padded update and move markers', async () => {
        const source = join(tempDir, 'whitespace-padded-source.txt')
        const target = join(tempDir, 'whitespace-padded-target.txt')
        await writeFile(source, 'x', 'utf8')

        const patch = `*** Begin Patch\n  *** Update File: ${source}  \n   *** Move to: ${target} \n@@\n-x\n+y\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(source), '')
        assert.strictEqual(await readText(target), 'y\n')
    })

    test('supports end-of-file marker and appends trailing newline on update', async () => {
        const target = join(tempDir, 'append-newline.txt')
        await writeFile(target, 'no newline at end', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-no newline at end\n+first line\n+second line\n*** End of File\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'first line\nsecond line\n')
    })

    test('supports end-of-file pure addition', async () => {
        const target = join(tempDir, 'append-only.txt')
        await writeFile(target, 'line-1\nline-2\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n+line-3\n*** End of File\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'line-1\nline-2\nline-3\n')
    })

    test('supports deletion-only hunks', async () => {
        const target = join(tempDir, 'deletion-only.txt')
        await writeFile(target, 'a\nb\nc\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-b\n-c\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'a\n')
    })

    test('matches old lines with trailing whitespace differences', async () => {
        const target = join(tempDir, 'rstrip-match.txt')
        await writeFile(target, 'value   \n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-value\n+trimmed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'trimmed\n')
    })

    test('matches old lines with leading and trailing whitespace differences', async () => {
        const target = join(tempDir, 'trim-match.txt')
        await writeFile(target, '    value   \n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-value\n+normalized\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'normalized\n')
    })

    test('matches old lines with normalized unicode punctuation', async () => {
        const target = join(tempDir, 'unicode-normalized.txt')
        await writeFile(target, 'import asyncio  # local import – avoids top‑level dep\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-import asyncio  # local import - avoids top-level dep\n+import asyncio  # changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'import asyncio  # changed\n')
    })

    test('supports CRLF patch input', async () => {
        const target = join(tempDir, 'crlf-patch.txt')
        await writeFile(target, 'before\n', 'utf8')

        const patch = `*** Begin Patch\r\n*** Update File: ${target}\r\n@@\r\n-before\r\n+after\r\n*** End Patch\r\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'after\n')
    })

    test('keeps partial updates when later operation fails', async () => {
        const created = join(tempDir, 'partial-created.txt')
        const missing = join(tempDir, 'partial-missing.txt')
        const patch = `*** Begin Patch\n*** Add File: ${created}\n+created\n*** Update File: ${missing}\n@@\n-old\n+new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
        assert.strictEqual(await readText(created), 'created\n')
    })

    test('returns error when deleting a directory path', async () => {
        const dirPath = join(tempDir, 'delete-dir')
        await mkdir(dirPath, { recursive: true })

        const patch = `*** Begin Patch\n*** Delete File: ${dirPath}\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
    })

    test('denies writes outside writable roots', async () => {
        const deniedPath = '/tmp/memo-tools-outside-denied.txt'
        const patch = `*** Begin Patch\n*** Add File: ${deniedPath}\n+blocked\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
        const text = textPayload(result)
        assert.ok(text.includes('sandbox') || text.includes('不在允许目录'))
    })
})
