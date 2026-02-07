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
        const result = await applyPatchTool.execute({ input: '*** Bad Patch\n' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('patch must start with'))
    })

    test('supports move + update in one operation', async () => {
        const source = join(tempDir, 'source.txt')
        const target = join(tempDir, 'nested', 'target.txt')
        await writeFile(source, 'hello old', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${source}\n*** Move to: ${target}\n@@\n-hello old\n+hello new\n*** End Patch\n`
        const result = await applyPatchTool.execute({ input: patch })

        assert.ok(!result.isError)
        assert.strictEqual(await readText(source), '')
        assert.strictEqual(await readText(target), 'hello new')
    })

    test('fails when hunk context does not exist', async () => {
        const target = join(tempDir, 'context-miss.txt')
        await writeFile(target, 'line-a\nline-b', 'utf8')

        const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-line-x\n+line-y\n*** End Patch\n`
        const result = await applyPatchTool.execute({ input: patch })

        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('context not found'))
    })

    test('denies writes outside writable roots', async () => {
        const deniedPath = '/tmp/memo-tools-outside-denied.txt'
        const patch = `*** Begin Patch\n*** Add File: ${deniedPath}\n+blocked\n*** End Patch\n`
        const result = await applyPatchTool.execute({ input: patch })

        assert.strictEqual(result.isError, true)
        const text = textPayload(result)
        assert.ok(text.includes('sandbox') || text.includes('不在允许目录'))
    })
})
