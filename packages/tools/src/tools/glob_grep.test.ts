import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { globTool } from '@memo/tools/tools/glob'
import { grepTool } from '@memo/tools/tools/grep'

let tempDir: string
let filePath: string

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function removeDir(dir: string) {
    await rm(dir, { recursive: true, force: true })
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-glob-grep')
    filePath = join(tempDir, 'sample.txt')
    await writeFile(filePath, 'hello\nfoo bar\nbaz', 'utf8')
})

afterAll(async () => {
    await removeDir(tempDir)
})

describe('glob tool', () => {
    test('matches files under given path', async () => {
        const res = await globTool.execute({ pattern: '**/*.txt', path: tempDir })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('sample.txt'), 'should list matching file')
    })

    test('returns hint when no matches', async () => {
        const res = await globTool.execute({ pattern: '*.md', path: tempDir })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.strictEqual(text, '未找到匹配文件')
    })

    test('truncates oversized match list', async () => {
        const bulkDir = join(tempDir, 'glob-bulk')
        await mkdir(bulkDir, { recursive: true })
        await Promise.all(
            Array.from({ length: 130 }, (_, i) =>
                writeFile(join(bulkDir, `file-${String(i + 1).padStart(3, '0')}.txt`), 'x', 'utf8'),
            ),
        )

        const res = await globTool.execute({ pattern: 'glob-bulk/*.txt', path: tempDir })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('<system_hint>当前查找结果过多'), 'should include overflow hint')
        assert.ok(!text.includes('file-130.txt'), 'should truncate late entries')
    })
})

describe('grep tool', () => {
    const rgAvailable = (() => {
        const result = spawnSync('rg', ['--version'], { stdio: 'ignore' })
        return !result.error && result.status === 0
    })()

    test('finds content with default output', async () => {
        const res = await grepTool.execute({ pattern: 'foo', path: tempDir })
        if (!rgAvailable) {
            const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
            assert.strictEqual(text, 'rg 未安装或不在 PATH')
            return
        }
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('sample.txt'), 'should include filename')
        assert.ok(text.includes('foo bar'), 'should include matching line')
    })

    test('supports count output mode', async () => {
        const res = await grepTool.execute({
            pattern: 'hello',
            path: tempDir,
            output_mode: 'count',
        })
        if (!rgAvailable) {
            const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
            assert.strictEqual(text, 'rg 未安装或不在 PATH')
            return
        }
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        const trimmed = text.trim()
        assert.ok(trimmed.endsWith(':1') || /^\d+$/.test(trimmed))
    })

    test('returns hint when no matches', async () => {
        const res = await grepTool.execute({ pattern: 'notfound', path: tempDir })
        if (!rgAvailable) {
            const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
            assert.strictEqual(text, 'rg 未安装或不在 PATH')
            return
        }
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.strictEqual(text, '未找到匹配')
    })

    test('truncates oversized grep output', async () => {
        const target = join(tempDir, 'grep-bulk.txt')
        const content = Array.from({ length: 150 }, (_, i) => `token line-${i + 1}`).join('\n')
        await writeFile(target, content, 'utf8')

        const res = await grepTool.execute({ pattern: 'token', path: tempDir })
        if (!rgAvailable) {
            const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
            assert.strictEqual(text, 'rg 未安装或不在 PATH')
            return
        }
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('<system_hint>当前查找结果过多'), 'should include overflow hint')
        assert.ok(!text.includes('line-150'), 'should truncate late matches')
    })
})
