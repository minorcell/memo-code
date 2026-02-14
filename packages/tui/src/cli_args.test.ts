import assert from 'node:assert'
import { describe, test } from 'vitest'
import { parseArgs } from './cli_args'

describe('parseArgs', () => {
    test('parses --once and --prev long flags', () => {
        const parsed = parseArgs(['--once', '--prev', 'hello'])
        assert.strictEqual(parsed.options.once, true)
        assert.strictEqual(parsed.options.prev, true)
        assert.strictEqual(parsed.question, 'hello')
    })

    test('parses -once and -prev short forms', () => {
        const parsed = parseArgs(['-once', '-prev', 'plan', 'this'])
        assert.strictEqual(parsed.options.once, true)
        assert.strictEqual(parsed.options.prev, true)
        assert.strictEqual(parsed.question, 'plan this')
    })

    test('parses dangerous and version flags', () => {
        const parsed = parseArgs(['-d', '--version'])
        assert.strictEqual(parsed.options.dangerous, true)
        assert.strictEqual(parsed.options.showVersion, true)
    })

    test('keeps unknown args as question text', () => {
        const parsed = parseArgs(['--foo', 'bar'])
        assert.strictEqual(parsed.question, '--foo bar')
    })
})
