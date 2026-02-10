import assert from 'node:assert'
import { describe, test } from 'vitest'
import { shellTool } from '@memo/tools/tools/shell'
import { shellCommandTool } from '@memo/tools/tools/shell_command'
import { writeStdinTool } from '@memo/tools/tools/write_stdin'
import { updatePlanTool } from '@memo/tools/tools/update_plan'

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

describe('shell wrappers and update_plan', () => {
    test('shell tool executes argv command form', async () => {
        const result = await shellTool.execute({
            command: ['echo', 'shell-wrapper-ok'],
        })

        const text = textPayload(result)
        assert.ok(!result.isError)
        assert.ok(text.includes('shell-wrapper-ok'))
    })

    test('shell tool blocks dangerous argv command', async () => {
        const result = await shellTool.execute({
            command: ['mkfs.ext4', '/dev/sda'],
        })

        const text = textPayload(result)
        assert.ok(text.startsWith('<system_hint '))
        assert.ok(text.includes('tool="shell"'))
        assert.ok(text.includes('reason="dangerous_command"'))
    })

    test('shell_command executes script command form', async () => {
        const result = await shellCommandTool.execute({
            command: 'echo shell-command-ok',
            login: false,
            timeout_ms: 1000,
        })

        const text = textPayload(result)
        assert.ok(!result.isError)
        assert.ok(text.includes('shell-command-ok'))
    })

    test('shell_command blocks dangerous script command', async () => {
        const result = await shellCommandTool.execute({
            command: 'dd if=/dev/zero of=/dev/sda bs=1M',
            login: false,
            timeout_ms: 1000,
        })

        const text = textPayload(result)
        assert.ok(text.startsWith('<system_hint '))
        assert.ok(text.includes('tool="shell_command"'))
        assert.ok(text.includes('reason="dangerous_command"'))
    })

    test('write_stdin fails for unknown session id', async () => {
        const result = await writeStdinTool.execute({ session_id: 999999, chars: 'noop' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('session_id 999999 not found'))
    })

    test('update_plan accepts one in_progress item', async () => {
        const result = await updatePlanTool.execute({
            explanation: 'working plan',
            plan: [
                { step: 'step one', status: 'completed' },
                { step: 'step two', status: 'in_progress' },
                { step: 'step three', status: 'pending' },
            ],
        })

        assert.ok(!result.isError)
        const parsed = JSON.parse(textPayload(result))
        assert.strictEqual(parsed.message, 'Plan updated')
        assert.strictEqual(parsed.plan[1].status, 'in_progress')
    })
})
