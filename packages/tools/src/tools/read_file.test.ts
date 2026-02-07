import assert from 'node:assert'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { readFileTool } from '@memo/tools/tools/read_file'

let tempDir: string

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-read-file')
})

afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
})

describe('read_file tool', () => {
    test('reads a simple slice with line numbers', async () => {
        const target = join(tempDir, 'slice.txt')
        await writeFile(target, 'a\nb\nc\nd', 'utf8')

        const result = await readFileTool.execute({
            file_path: target,
            offset: 2,
            limit: 2,
        })

        assert.ok(!result.isError)
        assert.strictEqual(textPayload(result), 'L2: b\nL3: c')
    })

    test('returns error when offset exceeds file length', async () => {
        const target = join(tempDir, 'offset.txt')
        await writeFile(target, 'line', 'utf8')

        const result = await readFileTool.execute({
            file_path: target,
            offset: 99,
            limit: 1,
        })

        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('offset exceeds file length'))
    })

    test('supports indentation mode with sibling exclusion', async () => {
        const target = join(tempDir, 'indent.txt')
        await writeFile(target, 'root\n  child1\n    grand\n  child2\ntail', 'utf8')

        const result = await readFileTool.execute({
            file_path: target,
            mode: 'indentation',
            offset: 3,
            limit: 10,
            indentation: {
                include_siblings: false,
                max_levels: 0,
            },
        })

        assert.ok(!result.isError)
        assert.strictEqual(textPayload(result), 'L2:   child1\nL3:     grand\nL4:   child2')
    })

    test('clips very long lines to avoid huge payloads', async () => {
        const target = join(tempDir, 'long-line.txt')
        const longLine = 'x'.repeat(700)
        await writeFile(target, longLine, 'utf8')

        const result = await readFileTool.execute({ file_path: target })
        const text = textPayload(result)

        assert.ok(!text.includes('x'.repeat(550)))
        assert.ok(text.includes('x'.repeat(500)))
    })
})
