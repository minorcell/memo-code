import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, test, beforeAll, afterAll } from 'bun:test'
import { createAgentSession, createTokenCounter } from '@memo/core'

let tempHome: string
let prevMemoHome: string | undefined

beforeAll(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'memo-core-memory-'))
    prevMemoHome = process.env.MEMO_HOME
    process.env.MEMO_HOME = tempHome
})

afterAll(async () => {
    if (prevMemoHome === undefined) {
        delete process.env.MEMO_HOME
    } else {
        process.env.MEMO_HOME = prevMemoHome
    }
    await rm(tempHome, { recursive: true, force: true })
})

describe('memory injection', () => {
    test('loads memory into system prompt when file exists', async () => {
        const memoryPath = join(tempHome, 'memory.md')
        await Bun.write(memoryPath, '用户偏好：中文回答\n')

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
            assert.ok(systemPrompt.includes('长期记忆'), 'system prompt should include memory section')
            assert.ok(systemPrompt.includes('用户偏好：中文回答'), 'memory content should be injected')
        } finally {
            await session.close()
        }
    })
})
