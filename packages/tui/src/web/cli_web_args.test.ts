import assert from 'node:assert'
import { describe, test } from 'vitest'
import { parseWebArgs } from './cli_web_args'

describe('parseWebArgs', () => {
    test('parses host and port', () => {
        const parsed = parseWebArgs(['--host', '0.0.0.0', '--port', '6499'])
        assert.strictEqual(parsed.host, '0.0.0.0')
        assert.strictEqual(parsed.port, 6499)
        assert.strictEqual(parsed.open, true)
    })

    test('parses --no-open flag', () => {
        const parsed = parseWebArgs(['--no-open'])
        assert.strictEqual(parsed.open, false)
    })

    test('ignores invalid port value', () => {
        const parsed = parseWebArgs(['--port', '99999'])
        assert.strictEqual(parsed.port, undefined)
    })

    test('parses static dir', () => {
        const parsed = parseWebArgs(['--static-dir', '/tmp/ui'])
        assert.strictEqual(parsed.staticDir, '/tmp/ui')
    })
})
