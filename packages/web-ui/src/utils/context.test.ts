import { describe, expect, test } from 'vitest'
import { calculateContextPercent } from './context'

describe('calculateContextPercent', () => {
    test('returns 0 when context limit is unavailable', () => {
        expect(calculateContextPercent(1200, 0)).toBe(0)
    })

    test('parses numeric strings', () => {
        expect(calculateContextPercent('20872', '120000')).toBeCloseTo(17.393333, 5)
    })

    test('returns 0 when values are non-numeric strings', () => {
        expect(calculateContextPercent('abc', '120000')).toBe(0)
    })

    test('caps value at 100 percent', () => {
        expect(calculateContextPercent(30000, 12000)).toBe(100)
    })
})
