import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { listDirTool } from '@memo/tools/tools/list_dir'
import { grepFilesTool } from '@memo/tools/tools/grep_files'

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

function rgAvailable() {
    return spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-list-grep')
})

afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
})

describe('list_dir tool', () => {
    test('respects depth limit', async () => {
        const root = join(tempDir, 'depth')
        const nested = join(root, 'nested')
        await mkdir(nested, { recursive: true })
        await writeFile(join(root, 'a.txt'), 'a', 'utf8')
        await writeFile(join(nested, 'b.txt'), 'b', 'utf8')

        const result = await listDirTool.execute({ dir_path: root, depth: 1, limit: 20 })
        const text = textPayload(result)

        assert.ok(text.includes('a.txt'))
        assert.ok(text.includes('nested/'))
        assert.ok(!text.includes('b.txt'))
    })

    test('returns error when offset is out of range', async () => {
        const root = join(tempDir, 'offset')
        await mkdir(root, { recursive: true })
        await writeFile(join(root, 'only.txt'), 'x', 'utf8')

        const result = await listDirTool.execute({ dir_path: root, offset: 9 })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('offset exceeds directory entry count'))
    })
})

describe('grep_files tool', () => {
    test('rejects blank pattern after trim', async () => {
        const result = await grepFilesTool.execute({ pattern: '   ' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('pattern must not be empty'))
    })

    test('returns no matches text when pattern not found', async () => {
        if (!rgAvailable()) return

        const root = join(tempDir, 'grep-none')
        await mkdir(root, { recursive: true })
        await writeFile(join(root, 'a.txt'), 'hello', 'utf8')

        const result = await grepFilesTool.execute({ pattern: 'not-existing', path: root })
        assert.ok(!result.isError)
        assert.strictEqual(textPayload(result), 'No matches found.')
    })

    test('supports include glob filter', async () => {
        if (!rgAvailable()) return

        const root = join(tempDir, 'grep-glob')
        await mkdir(root, { recursive: true })
        await writeFile(join(root, 'match.rs'), 'needle', 'utf8')
        await writeFile(join(root, 'match.txt'), 'needle', 'utf8')

        const result = await grepFilesTool.execute({
            pattern: 'needle',
            include: '*.rs',
            path: root,
            limit: 10,
        })

        const text = textPayload(result)
        assert.ok(text.includes('match.rs'))
        assert.ok(!text.includes('match.txt'))
    })
})
