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

describe('apply_patch tool (direct replace)', () => {
    test('replace first match by default', async () => {
        const target = join(tempDir, 'single.txt')
        await writeFile(target, 'foo bar foo', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            old_string: 'foo',
            new_string: 'baz',
        })

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'baz bar foo')
        assert.ok(textPayload(result).includes('Replacements: 1'))
    })

    test('replace all matches when replace_all is true', async () => {
        const target = join(tempDir, 'replace-all.txt')
        await writeFile(target, 'x y x y', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            old_string: 'y',
            new_string: 'z',
            replace_all: true,
        })

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'x z x z')
        assert.ok(textPayload(result).includes('Replacements: 2'))
    })

    test('supports batch edits in one call', async () => {
        const target = join(tempDir, 'batch.txt')
        await writeFile(target, 'alpha beta gamma beta', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            edits: [
                { old_string: 'alpha', new_string: 'A' },
                { old_string: 'beta', new_string: 'B', replace_all: true },
                { old_string: 'gamma', new_string: 'G' },
            ],
        })

        assertPatchOk(result)
        assert.strictEqual(await readText(target), 'A B G B')
        assert.ok(textPayload(result).includes('Edits: 3'))
        assert.ok(textPayload(result).includes('Replacements: 4'))
    })

    test('fails batch edits atomically when one edit is missing', async () => {
        const target = join(tempDir, 'batch-atomic.txt')
        await writeFile(target, 'foo bar baz', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            edits: [
                { old_string: 'foo', new_string: 'FOO' },
                { old_string: 'not-found', new_string: 'X' },
            ],
        })

        assertPatchError(result, 'target text not found at edit 2')
        assert.strictEqual(await readText(target), 'foo bar baz')
    })

    test('returns error when target text is missing', async () => {
        const target = join(tempDir, 'missing-target.txt')
        await writeFile(target, 'hello world', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            old_string: 'xxx',
            new_string: 'yyy',
        })

        assertPatchError(result, 'target text not found')
        assert.strictEqual(await readText(target), 'hello world')
    })

    test('returns no changes when replacement results in identical content', async () => {
        const target = join(tempDir, 'no-change.txt')
        await writeFile(target, 'same', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: target,
            old_string: 'same',
            new_string: 'same',
        })

        assertPatchOk(result)
        assert.strictEqual(textPayload(result), 'No changes made.')
        assert.strictEqual(await readText(target), 'same')
    })

    test('returns error when file does not exist', async () => {
        const target = join(tempDir, 'missing.txt')

        const result = await applyPatchTool.execute({
            file_path: target,
            old_string: 'a',
            new_string: 'b',
        })

        assertPatchError(result, 'file does not exist')
    })

    test('denies writes outside writable roots', async () => {
        const outside = '/tmp/memo-tools-apply-patch-outside.txt'
        await writeFile(outside, 'hello', 'utf8')

        const result = await applyPatchTool.execute({
            file_path: outside,
            old_string: 'hello',
            new_string: 'world',
        })

        assertPatchError(result)
        const text = textPayload(result)
        assert.ok(text.includes('sandbox') || text.includes('不在允许目录'))
        await rm(outside, { force: true })
    })
})
