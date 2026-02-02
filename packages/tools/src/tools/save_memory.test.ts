import assert from 'node:assert'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { saveMemoryTool } from '@memo/tools/tools/save_memory'

let tempHome: string
let prevMemoHome: string | undefined

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function removeDir(dir: string) {
    await rm(dir, { recursive: true, force: true })
}

async function readText(path: string) {
    try {
        return await readFile(path, 'utf8')
    } catch {
        return ''
    }
}

beforeAll(async () => {
    tempHome = await makeTempDir('memo-tools-memory')
    prevMemoHome = process.env.MEMO_HOME
    process.env.MEMO_HOME = tempHome
})

afterAll(async () => {
    if (prevMemoHome === undefined) {
        delete process.env.MEMO_HOME
    } else {
        process.env.MEMO_HOME = prevMemoHome
    }
    await removeDir(tempHome)
})

describe('memory tool', () => {
    test('rejects empty note', async () => {
        const parsed = saveMemoryTool.inputSchema.safeParse({ fact: '' })
        assert.strictEqual(parsed.success, false)
    })

    test('rejects too long note', async () => {
        const parsed = saveMemoryTool.inputSchema.safeParse({ fact: 'a'.repeat(140) })
        assert.strictEqual(parsed.success, false)
    })

    test('appends sanitized note to memory file', async () => {
        const res = await saveMemoryTool.execute({ fact: '  喜欢中文回答\n' })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('Agents.md'), 'should report Agents.md in path')
        const memoryPath = join(tempHome, 'Agents.md')
        const content = await readText(memoryPath)
        assert.ok(content.includes('喜欢中文回答'), 'memory file should contain the Chinese fact')
        assert.ok(content.includes('Memo Added Memories'), 'should include header')
        assert.ok(!content.includes('\n\n\n'), 'newlines should be sanitized')
    })

    test('keeps only 50 most recent notes', async () => {
        const memoryPath = join(tempHome, 'Agents.md')
        for (let i = 0; i < 55; i++) {
            await saveMemoryTool.execute({ fact: `n${i}` })
        }
        const content = await readText(memoryPath)
        const lines = content.split(/\r?\n/).filter((l) => l.trim().startsWith('- '))
        assert.strictEqual(lines.length, 50, 'should retain at most 50 entries')
        assert.ok(lines.length > 0, 'should have entries')
        const first = lines[0]!
        const last = lines[lines.length - 1]!
        assert.ok(first.includes('n5'), 'should drop oldest entries')
        assert.ok(last.includes('n54'), 'should keep newest entry')
    })
})
