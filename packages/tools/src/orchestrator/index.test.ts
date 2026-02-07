import assert from 'node:assert'
import { describe, test } from 'vitest'
import { z } from 'zod'
import { createToolOrchestrator } from './index'

describe('tool orchestrator', () => {
    test('stops on rejection in sequential execution', async () => {
        const calls: string[] = []
        const orchestrator = createToolOrchestrator({
            tools: {
                bash: {
                    name: 'bash',
                    execute: async () => {
                        calls.push('bash')
                        return { content: [{ type: 'text', text: 'ok' }] }
                    },
                },
                read: {
                    name: 'read',
                    execute: async () => {
                        calls.push('read')
                        return { content: [{ type: 'text', text: 'read' }] }
                    },
                },
            },
        })

        const result = await orchestrator.executeActions(
            [
                { name: 'bash', input: { command: 'echo hi' } },
                { name: 'read', input: { file_path: 'a.txt' } },
            ],
            {
                requestApproval: async () => 'deny',
            },
        )

        assert.strictEqual(result.hasRejection, true)
        assert.deepStrictEqual(calls, [])
        assert.strictEqual(result.results.length, 1)
        assert.strictEqual(result.results[0]?.tool, 'bash')
        assert.strictEqual(result.results[0]?.status, 'approval_denied')
        assert.strictEqual(result.results[0]?.errorType, 'approval_denied')
        assert.strictEqual(result.results[0]?.rejected, true)
        assert.ok((result.results[0]?.durationMs ?? 0) >= 0)
        assert.ok(result.results[0]?.actionId.length)
    })

    test('executes tool when approval is granted', async () => {
        const orchestrator = createToolOrchestrator({
            tools: {
                write: {
                    name: 'write',
                    validateInput: (input) => {
                        const schema = z.object({ file_path: z.string() })
                        const parsed = schema.safeParse(input)
                        return parsed.success
                            ? { ok: true, data: parsed.data }
                            : { ok: false, error: 'invalid input' }
                    },
                    execute: async () => ({
                        content: [{ type: 'text', text: 'written' }],
                    }),
                },
            },
        })

        const result = await orchestrator.executeAction(
            { name: 'write', input: { file_path: 'a.txt' } },
            { requestApproval: async () => 'once' },
        )

        assert.strictEqual(result.success, true)
        assert.strictEqual(result.status, 'success')
        assert.strictEqual(result.observation, 'written')
        assert.ok(result.durationMs >= 0)
        assert.ok(result.actionId.length)
    })

    test('returns unknown tool error', async () => {
        const orchestrator = createToolOrchestrator({ tools: {} })
        const result = await orchestrator.executeAction(
            { name: 'missing', input: {} },
            { requestApproval: async () => 'once' },
        )
        assert.strictEqual(result.success, false)
        assert.strictEqual(result.status, 'tool_not_found')
        assert.strictEqual(result.errorType, 'tool_not_found')
        assert.strictEqual(result.observation, 'Unknown tool: missing')
    })

    test('classifies sandbox-like execution failures', async () => {
        const orchestrator = createToolOrchestrator({
            tools: {
                bash: {
                    name: 'bash',
                    execute: async () => {
                        throw new Error('Permission denied by sandbox')
                    },
                },
            },
        })
        const result = await orchestrator.executeAction(
            { name: 'bash', input: { command: 'rm -rf /' } },
            { requestApproval: async () => 'once' },
        )
        assert.strictEqual(result.success, false)
        assert.strictEqual(result.status, 'sandbox_denied')
        assert.strictEqual(result.errorType, 'sandbox_denied')
        assert.ok(result.observation.startsWith('Tool execution failed:'))
    })
})
