import assert from 'node:assert'
import { describe, test } from 'vitest'
import {
    closeAgentTool,
    resumeAgentTool,
    sendInputTool,
    spawnAgentTool,
    waitTool,
} from '@memo/tools/tools/collab'

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

describe('collab tools', () => {
    test('spawn/send/close/resume lifecycle works', async () => {
        const spawnResult = await spawnAgentTool.execute({ message: 'task one' })
        const spawned = JSON.parse(textPayload(spawnResult))

        assert.strictEqual(spawned.status, 'running')
        assert.ok(typeof spawned.id === 'string' && spawned.id.length > 0)

        const sendResult = await sendInputTool.execute({
            id: spawned.id,
            message: 'updated task',
        })
        const sent = JSON.parse(textPayload(sendResult))
        assert.strictEqual(sent.lastMessage, 'updated task')

        const closeResult = await closeAgentTool.execute({ id: spawned.id })
        const closed = JSON.parse(textPayload(closeResult))
        assert.strictEqual(closed.status, 'closed')

        const resumeResult = await resumeAgentTool.execute({ id: spawned.id })
        const resumed = JSON.parse(textPayload(resumeResult))
        assert.strictEqual(resumed.status, 'running')
    })

    test('wait returns snapshot for existing and missing agents', async () => {
        const spawnResult = await spawnAgentTool.execute({ message: 'for wait' })
        const spawned = JSON.parse(textPayload(spawnResult))

        const result = await waitTool.execute({ ids: [spawned.id, 'missing-id'] })
        const parsed = JSON.parse(textPayload(result))

        assert.strictEqual(parsed.statuses.length, 2)
        assert.strictEqual(parsed.statuses[0].id, spawned.id)
        assert.strictEqual(parsed.statuses[0].status, 'running')
        assert.strictEqual(parsed.statuses[1].id, 'missing-id')
        assert.strictEqual(parsed.statuses[1].status, 'closed')
    })

    test('returns explicit error for missing agent on mutating calls', async () => {
        const sendResult = await sendInputTool.execute({ id: 'missing', message: 'x' })
        assert.strictEqual(sendResult.isError, true)
        assert.ok(textPayload(sendResult).includes('agent not found'))

        const closeResult = await closeAgentTool.execute({ id: 'missing' })
        assert.strictEqual(closeResult.isError, true)

        const resumeResult = await resumeAgentTool.execute({ id: 'missing' })
        assert.strictEqual(resumeResult.isError, true)
    })
})
