import assert from 'node:assert'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { globTool } from '@memo/tools/tools/glob'

let tempDir: string

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function removeDir(dir: string) {
    await rm(dir, { recursive: true, force: true })
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-glob')
    await writeFile(join(tempDir, 'a.ts'), 'content')
    await writeFile(join(tempDir, 'b.js'), 'content')
})

afterAll(async () => {
    await removeDir(tempDir)
})

describe('glob tool', () => {
    test('validates input', async () => {
        const res = globTool.validateInput?.({})
        assert.ok(res && !res.ok)
    })

    test('matches pattern under provided path', async () => {
        const res = await globTool.execute({ pattern: '**/*.ts', path: tempDir })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        const files = text
            .split('\n')
            .filter(Boolean)
            .map((p) => basename(p))
        assert.deepStrictEqual(files.sort(), ['a.ts'])
    })
})
