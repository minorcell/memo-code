import { describe, expect, test } from 'vitest'
import { accumulateUsage, emptyUsage } from '@memo/core/runtime/session_runtime_helpers'

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
