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

describe('apply_patch tool (codex-aligned)', () => {
    test('rejects malformed patch header', async () => {
        const result = await runPatch('*** Bad Patch\n')
        assertPatchError(result, 'first line of the patch must be')
    })

    test('rejects missing end marker', async () => {
        const target = join(tempDir, 'missing-end.txt')
        const patch = `*** Begin Patch\n*** Add File: ${target}\n+x`
        const result = await runPatch(patch)
        assertPatchError(result, 'last line of the patch must be')
    })

    test('rejects unknown hunk header with line number', async () => {
        const patch = `*** Begin Patch\n*** Unknown Op: x\n*** End Patch\n`
        const result = await runPatch(patch)
        assertPatchError(result, 'line 2')
        assertPatchError(result, 'not a valid hunk header')
    })

    test('returns error when patch contains no operations', async () => {
        const result = await runPatch('*** Begin Patch\n*** End Patch\n')
        assertPatchError(result, 'No files were modified')
    })

    test('adds file with + lines', async () => {
        const target = join(tempDir, 'add.txt')
        const patch = `*** Begin Patch\n*** Add File: ${target}\n+alpha\n+beta\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'alpha\nbeta\n')
    })

    test('supports empty add file body', async () => {
        const target = join(tempDir, 'empty-add.txt')
        const patch = `*** Begin Patch\n*** Add File: ${target}\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), '')
    })

    test('deletes a file', async () => {
        const target = join(tempDir, 'delete-me.txt')
        await writeFile(target, 'hello\n', 'utf8')

        const patch = `*** Begin Patch\n*** Delete File: ${target}\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), '')
    })

    test('returns error when deleting directory path', async () => {
        const dirPath = join(tempDir, 'delete-dir')
        await mkdir(dirPath, { recursive: true })

        const patch = `*** Begin Patch\n*** Delete File: ${dirPath}\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
    })

    test('updates file with exact match', async () => {
        const target = join(tempDir, 'update-exact.txt')
        await writeFile(target, 'before\nhello\nafter\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n before\n-hello\n+world\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'before\nworld\nafter\n')
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

    test('first update chunk may omit @@ context marker', async () => {
        const target = join(tempDir, 'missing-context-first.txt')
        await writeFile(target, 'alpha\nbeta\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n-alpha\n+alpha2\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'alpha2\nbeta\n')
    })

    test('non-first update chunk requires @@ marker', async () => {
        const target = join(tempDir, 'missing-context-later.txt')
        await writeFile(target, 'a\nb\nc\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n a\n-b\n+b2\nnot-a-hunk-header\n-c\n+c2\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'expected update hunk to start with "@@"')
    })

    test('supports @@ <context> targeting', async () => {
        const target = join(tempDir, 'context-targeting.txt')
        await writeFile(target, 'fn a\nvalue=1\nfn b\nvalue=2\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ fn b\n-value=2\n+value=20\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'fn a\nvalue=1\nfn b\nvalue=20\n')
    })

    test('fails when context hint cannot be found', async () => {
        const target = join(tempDir, 'context-miss.txt')
        await writeFile(target, 'a\nb\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@ missing\n-b\n+c\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'Failed to find context')
    })

    test('supports move + update in one operation', async () => {
        const source = join(tempDir, 'source.txt')
        const target = join(tempDir, 'nested', 'target.txt')
        await writeFile(source, 'hello old\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${target}\n@@\n-hello old\n+hello new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(source), '')
        assert.strictEqual(await readText(target), 'hello new\n')
    })

    test('supports move to same path', async () => {
        const target = join(tempDir, 'move-same.txt')
        await writeFile(target, 'old\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n*** Move to: ${target}\n@@\n-old\n+new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'new\n')
    })

    test('keeps source unchanged when move target is denied by sandbox', async () => {
        const source = join(tempDir, 'move-denied-source.txt')
        const deniedTarget = '/tmp/memo-tools-move-denied-target.txt'
        await writeFile(source, 'keep-me\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${deniedTarget}\n@@\n-keep-me\n+changed\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result, 'sandbox')
        assert.strictEqual(await readText(source), 'keep-me\n')
    })

    test('supports end-of-file pure addition', async () => {
        const target = join(tempDir, 'append-only.txt')
        await writeFile(target, 'line-1\nline-2\n', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n+line-3\n*** End of File\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'line-1\nline-2\nline-3\n')
    })

    test('supports end-of-file replacement and enforces trailing newline', async () => {
        const target = join(tempDir, 'append-newline.txt')
        await writeFile(target, 'no newline at end', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-no newline at end\n+first line\n+second line\n*** End of File\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'first line\nsecond line\n')
    })

    test('supports CRLF patch input', async () => {
        const target = join(tempDir, 'crlf-patch.txt')
        await writeFile(target, 'before\n', 'utf8')

        const patch = `*** Begin Patch\r\n*** Update File: ${target}\r\n@@\r\n-before\r\n+after\r\n*** End Patch\r\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'after\n')
    })

    test('supports heredoc-wrapped input (lenient mode)', async () => {
        const target = join(tempDir, 'heredoc.txt')
        await writeFile(target, 'a\n', 'utf8')

        const patch = `<<'EOF'\n*** Begin Patch\n*** Update File: ${target}\n@@\n-a\n+b\n*** End Patch\nEOF\n`
        const result = await runPatch(patch)

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'b\n')
    })

    test('keeps partial updates when later operation fails', async () => {
        const created = join(tempDir, 'partial-created.txt')
        const missing = join(tempDir, 'partial-missing.txt')

        const patch = `*** Begin Patch\n*** Add File: ${created}\n+created\n*** Update File: ${missing}\n@@\n-old\n+new\n*** End Patch\n`
        const result = await runPatch(patch)

        assertPatchError(result)
        assert.strictEqual(await readText(created), 'created\n')
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
