/** @file 长期记忆注入系统提示词的回归测试。 */
import assert from 'node:assert'
import { join } from 'node:path'
import { tmpdir, userInfo } from 'node:os'
import { describe, test, beforeAll, afterAll } from 'vitest'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { createAgentSession, createTokenCounter } from '@memo/core'

let tempHome: string
let prevMemoHome: string | undefined

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function removeDir(dir: string) {
    await rm(dir, { recursive: true, force: true })
}

beforeAll(async () => {
    tempHome = await makeTempDir('memo-core-memory')
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

describe('memory injection', () => {
    test('loads memory into system prompt when file exists', async () => {
        const memoryPath = join(tempHome, 'Agents.md')
        await writeFile(memoryPath, '## Memo Added Memories\n\n- 用户偏好：中文回答\n', 'utf-8')

        const session = await createAgentSession(
            {
                callLLM: async () => ({ content: JSON.stringify({ final: 'ok' }) }),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
            },
            { mode: 'once' },
        )
        try {
            const systemPrompt = session.history[0]?.content ?? ''
            assert.ok(
                systemPrompt.includes('Long-Term Memory'),
                'system prompt should include memory section',
            )
            assert.ok(
                systemPrompt.includes('用户偏好：中文回答'),
                'memory content should be injected',
            )
        } finally {
            await session.close()
        }
    })

    test('injects runtime context into system prompt', async () => {
        const session = await createAgentSession(
            {
                callLLM: async () => ({ content: JSON.stringify({ final: 'ok' }) }),
                historySinks: [],
                tokenCounter: createTokenCounter('cl100k_base'),
            },
            { mode: 'once' },
        )
        try {
            const systemPrompt = session.history[0]?.content ?? ''
            assert.ok(systemPrompt.includes(process.cwd()), 'system prompt should include pwd')
            assert.ok(
                systemPrompt.includes(userInfo().username),
                'system prompt should include username',
            )
            assert.match(
                systemPrompt,
                /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/,
                'system prompt should include ISO date',
            )
            assert.ok(!systemPrompt.includes('{{date}}'), 'template variables should be rendered')
        } finally {
            await session.close()
        }
    })
})
