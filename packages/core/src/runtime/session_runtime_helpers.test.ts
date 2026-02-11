import { describe, expect, test, vi } from 'vitest'
import type { HistorySink } from '@memo/core/types'
import {
    accumulateUsage,
    emitEventToSinks,
    emptyUsage,
    stableStringify,
} from '@memo/core/runtime/session_runtime_helpers'

describe('accumulateUsage', () => {
    test('uses explicit total when provided', () => {
        const usage = emptyUsage()
        accumulateUsage(usage, { prompt: 2, completion: 3, total: 100 })
        expect(usage).toEqual({ prompt: 2, completion: 3, total: 100 })
    })

    test('falls back to prompt + completion when total is absent', () => {
        const usage = emptyUsage()
        accumulateUsage(usage, { prompt: 2, completion: 3 })
        expect(usage).toEqual({ prompt: 2, completion: 3, total: 5 })
    })
})

describe('emitEventToSinks', () => {
    test('writes structured error payload to stderr when sink append fails', async () => {
        const writes: string[] = []
        const writeSpy = vi
            .spyOn(process.stderr, 'write')
            .mockImplementation(((chunk: unknown) => {
                writes.push(String(chunk))
                return true
            }) as typeof process.stderr.write)

        const failingSink: HistorySink = {
            append: async () => {
                throw new Error('disk full')
            },
        }

        try {
            await emitEventToSinks(
                {
                    ts: '2026-01-01T00:00:00.000Z',
                    sessionId: 's-1',
                    type: 'assistant',
                    content: 'hello',
                },
                [failingSink],
            )
        } finally {
            writeSpy.mockRestore()
        }

        expect(writes.length).toBeGreaterThan(0)
        const parsed = JSON.parse(writes.join('').trim()) as Record<string, unknown>
        expect(parsed.level).toBe('error')
        expect(parsed.event).toBe('history_sink_append_failed')
        expect(parsed.message).toBe('disk full')
        expect(parsed.sink).toBe('Object')
    })
})

describe('stableStringify', () => {
    test('serializes self-referencing object without throwing', () => {
        const root: Record<string, unknown> = {}
        root.self = root

        const serialized = stableStringify(root)
        expect(serialized).toBe('{"self":"[Circular]"}')
    })

    test('serializes indirect circular references with circular marker', () => {
        const parent: Record<string, unknown> = { name: 'parent' }
        const child: Record<string, unknown> = { name: 'child', parent }
        parent.child = child

        const serialized = stableStringify(parent)
        expect(serialized).toContain('"child":{"name":"child","parent":"[Circular]"}')
        expect(serialized).toContain('"name":"parent"')
    })
})
