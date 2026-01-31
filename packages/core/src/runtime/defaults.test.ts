import { describe, expect, test } from 'bun:test'
import { parseToolArguments } from '@memo/core/runtime/defaults'

describe('parseToolArguments', () => {
    test('parses valid JSON string', () => {
        const res = parseToolArguments('{"a":1}')
        expect(res.ok).toBe(true)
        if (res.ok) {
            expect(res.data).toEqual({ a: 1 })
        }
    })

    test('returns error when JSON invalid', () => {
        const res = parseToolArguments('这不是json')
        expect(res.ok).toBe(false)
        if (!res.ok) {
            expect(res.raw).toBe('这不是json')
            expect(res.error.length).toBeGreaterThan(0)
        }
    })
})
