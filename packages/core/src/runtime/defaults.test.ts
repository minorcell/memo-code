import { describe, expect, test } from 'vitest'
import { parseToolArguments, filterMcpServersBySelection } from '@memo/core/runtime/defaults'

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

describe('filterMcpServersBySelection', () => {
    const servers = {
        alpha: { command: 'node', args: ['a.js'] },
        beta: { type: 'streamable_http' as const, url: 'https://example.com/mcp' },
    }

    test('returns all servers when no active list is provided', () => {
        expect(filterMcpServersBySelection(servers, undefined)).toEqual(servers)
    })

    test('returns only selected servers', () => {
        expect(filterMcpServersBySelection(servers, ['beta'])).toEqual({
            beta: servers.beta,
        })
    })

    test('returns empty map when active list is empty', () => {
        expect(filterMcpServersBySelection(servers, [])).toEqual({})
    })

    test('ignores unknown server names', () => {
        expect(filterMcpServersBySelection(servers, ['missing', 'alpha'])).toEqual({
            alpha: servers.alpha,
        })
    })
})
