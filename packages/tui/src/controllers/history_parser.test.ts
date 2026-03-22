import assert from 'node:assert'
import { describe, test } from 'vitest'
import type { SessionDetail } from '../http/api_types'
import { TOOL_STATUS } from '../types'
import { parseSessionDetail } from './history_parser'

describe('parseSessionDetail', () => {
    test('maps session detail to tui timeline model', () => {
        const detail: SessionDetail = {
            id: 'history-1',
            sessionId: 'session-1',
            filePath: '/tmp/history-1.jsonl',
            title: 'plan this task',
            project: 'demo',
            workspaceId: 'ws-1',
            cwd: '/tmp/demo',
            date: {
                day: '2026-03-03',
                startedAt: '2026-03-03T00:00:00.000Z',
                updatedAt: '2026-03-03T00:01:00.000Z',
            },
            status: 'idle',
            turnCount: 1,
            tokenUsage: {
                prompt: 10,
                completion: 12,
                total: 22,
            },
            toolUsage: {
                total: 1,
                success: 1,
                failed: 0,
                denied: 0,
                cancelled: 0,
            },
            summary: 'Session summary',
            turns: [
                {
                    turn: 1,
                    input: 'plan this task',
                    finalText: 'done',
                    status: 'ok',
                    steps: [
                        {
                            step: 0,
                            assistantText: 'thinking...',
                            thinking: 'need context',
                            action: {
                                tool: 'read_file',
                                input: { path: 'README.md' },
                            },
                            observation: 'loaded',
                            resultStatus: 'success',
                        },
                    ],
                },
            ],
            events: [],
        }

        const parsed = parseSessionDetail(detail)
        assert.strictEqual(parsed.messages.length, 2)
        assert.strictEqual(parsed.messages[0]?.role, 'user')
        assert.strictEqual(parsed.messages[0]?.content, 'plan this task')
        assert.strictEqual(parsed.messages[1]?.role, 'assistant')
        assert.strictEqual(parsed.messages[1]?.content, 'done')

        assert.strictEqual(parsed.turns.length, 1)
        const turn = parsed.turns[0]
        assert.ok(turn)
        assert.strictEqual(turn?.userInput, 'plan this task')
        assert.strictEqual(turn?.finalText, 'done')
        assert.strictEqual(turn?.status, 'ok')
        assert.strictEqual(turn?.steps.length, 1)
        assert.strictEqual(turn?.steps[0]?.action?.tool, 'read_file')
        assert.strictEqual(turn?.steps[0]?.thinking, 'need context')
        assert.strictEqual(turn?.steps[0]?.observation, 'loaded')
        assert.strictEqual(turn?.steps[0]?.toolStatus, TOOL_STATUS.SUCCESS)
    })
})
