import assert from 'node:assert'
import { describe, test } from 'vitest'
import { bashTool } from '@memo/tools/tools/bash'

describe('bash tool', () => {
    test('returns prompt when command is empty', async () => {
        const res = await bashTool.execute({ command: '   ' })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('bash 需要要执行的命令'))
    })

    test('executes simple command and captures output', async () => {
        const res = await bashTool.execute({ command: 'echo hello' })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('exit=0'), 'exit code should be captured')
        assert.ok(text.includes('hello'), 'stdout should include command output')
    })

    test('kills process on timeout and returns error', async () => {
        const res = await bashTool.execute({ command: 'sleep 1', timeout: 50 })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.strictEqual(res.isError, true, 'should mark timeout as error')
        assert.ok(text.includes('超时'), `expected timeout message, got "${text}"`)
    })

    test('truncates oversized stdout to prevent context blow-up', async () => {
        const res = await bashTool.execute({ command: "head -c 6000 /dev/zero | tr '\\0' 'a'" })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('<system_hint>bash 输出已截断'), 'should append truncation hint')
        assert.ok(!text.includes('a'.repeat(5000)), 'should not keep full stdout')
    })
})
