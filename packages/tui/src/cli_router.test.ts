import assert from 'node:assert'
import { describe, test } from 'vitest'
import { routeCli } from './cli_router'

describe('routeCli', () => {
    test('routes direct mcp subcommand', () => {
        const routed = routeCli(['mcp', 'list', '--json'])
        assert.deepStrictEqual(routed, {
            kind: 'subcommand',
            name: 'mcp',
            args: ['list', '--json'],
        })
    })

    test('routes mcp subcommand with leading -- separator', () => {
        const routed = routeCli(['--', 'mcp', 'get', 'remote'])
        assert.deepStrictEqual(routed, {
            kind: 'subcommand',
            name: 'mcp',
            args: ['get', 'remote'],
        })
    })

    test('keeps normal flags in default route', () => {
        const routed = routeCli(['--once', 'hello'])
        assert.deepStrictEqual(routed, {
            kind: 'default',
            args: ['--once', 'hello'],
        })
    })

    test('keeps unknown leading token in default route', () => {
        const routed = routeCli(['unknown', 'input'])
        assert.deepStrictEqual(routed, {
            kind: 'default',
            args: ['unknown', 'input'],
        })
    })
})
