import assert from 'node:assert'
import { describe, test } from 'vitest'
import { PasteBurst, retroStartIndex } from './paste_burst'

describe('paste_burst', () => {
    test('holds first ASCII char and flushes as typed after timeout', () => {
        const burst = new PasteBurst()
        const t0 = 100

        const decision = burst.onPlainChar('a', t0)
        assert.deepStrictEqual(decision, { type: 'retain_first_char' })
        assert.strictEqual(burst.isActive(), true)

        const result = burst.flushIfDue(t0 + PasteBurst.recommendedFlushDelayMs() + 1)
        assert.deepStrictEqual(result, { type: 'typed', text: 'a' })
        assert.strictEqual(burst.isActive(), false)
    })

    test('two fast ASCII chars begin buffered burst from pending first char', () => {
        const burst = new PasteBurst()
        const t0 = 100

        assert.deepStrictEqual(burst.onPlainChar('a', t0), { type: 'retain_first_char' })
        assert.deepStrictEqual(burst.onPlainChar('b', t0 + 1), {
            type: 'begin_buffer_from_pending',
        })
        burst.appendCharToBuffer('b', t0 + 1)

        const result = burst.flushIfDue(t0 + burst.recommendedActiveFlushDelayMs() + 2)
        assert.deepStrictEqual(result, { type: 'paste', text: 'ab' })
    })

    test('non-ASCII path avoids first-char hold while still detecting bursts', () => {
        const burst = new PasteBurst()
        const t0 = 200

        assert.strictEqual(burst.onPlainCharNoHold(t0), null)
        assert.strictEqual(burst.onPlainCharNoHold(t0 + 1), null)
        assert.deepStrictEqual(burst.onPlainCharNoHold(t0 + 2), {
            type: 'begin_buffer',
            retroChars: 2,
        })
    })

    test('decideBeginBuffer only triggers for paste-like prefixes', () => {
        const burst = new PasteBurst()
        const now = 300

        assert.strictEqual(burst.decideBeginBuffer(now, 'ab', 2), null)
        assert.strictEqual(burst.isActive(), false)

        const grabbed = burst.decideBeginBuffer(now + 1, 'a b', 2)
        assert.deepStrictEqual(grabbed, { start: 1, grabbed: ' b' })
        assert.strictEqual(burst.isBuffering(), true)
    })

    test('decideBeginBuffer accepts long non-whitespace prefixes', () => {
        const burst = new PasteBurst()
        const before = '0123456789abcdef'
        const grabbed = burst.decideBeginBuffer(400, before, 16)
        assert.deepStrictEqual(grabbed, { start: 0, grabbed: before })
    })

    test('retroStartIndex respects unicode code point boundaries', () => {
        const value = 'a🙂b'
        assert.strictEqual(retroStartIndex(value, 0), value.length)
        assert.strictEqual(retroStartIndex(value, 1), 3)
        assert.strictEqual(retroStartIndex(value, 2), 1)
    })

    test('flushBeforeModifiedInput returns pending first char', () => {
        const burst = new PasteBurst()
        const t0 = 500
        burst.onPlainChar('x', t0)

        assert.strictEqual(burst.flushBeforeModifiedInput(), 'x')
        assert.strictEqual(burst.isActive(), false)
    })

    test('flushBeforeModifiedInput returns full buffered text', () => {
        const burst = new PasteBurst()
        const t0 = 600

        burst.onPlainChar('a', t0)
        burst.onPlainChar('b', t0 + 1)
        burst.appendCharToBuffer('b', t0 + 1)
        const append = burst.onPlainChar('c', t0 + 2)
        assert.deepStrictEqual(append, { type: 'buffer_append' })
        burst.appendCharToBuffer('c', t0 + 2)

        assert.strictEqual(burst.flushBeforeModifiedInput(), 'abc')
    })

    test('appendNewlineIfActive only applies while buffering', () => {
        const burst = new PasteBurst()
        const t0 = 700

        burst.onPlainChar('a', t0)
        assert.strictEqual(burst.appendNewlineIfActive(t0 + 1), false)

        burst.onPlainChar('b', t0 + 1)
        burst.appendCharToBuffer('b', t0 + 1)
        assert.strictEqual(burst.appendNewlineIfActive(t0 + 2), true)
        assert.strictEqual(burst.flushBeforeModifiedInput(), 'ab\n')
    })

    test('newline suppression window survives burst flush and then expires', () => {
        const burst = new PasteBurst({
            charIntervalMs: 2,
            activeIdleTimeoutMs: 2,
            enterSuppressWindowMs: 20,
        })
        const t0 = 800

        burst.onPlainChar('a', t0)
        burst.onPlainChar('b', t0 + 1)
        burst.appendCharToBuffer('b', t0 + 1)

        const flushed = burst.flushIfDue(t0 + 5)
        assert.deepStrictEqual(flushed, { type: 'paste', text: 'ab' })
        assert.strictEqual(burst.newlineShouldInsertInsteadOfSubmit(t0 + 5), true)
        assert.strictEqual(burst.newlineShouldInsertInsteadOfSubmit(t0 + 22), false)
    })

    test('clearWindowAfterNonChar clears pending and timing state', () => {
        const burst = new PasteBurst()
        burst.onPlainChar('a', 900)
        assert.strictEqual(burst.hasPendingFirstChar(), true)

        burst.clearWindowAfterNonChar()
        assert.strictEqual(burst.hasPendingFirstChar(), false)
        assert.deepStrictEqual(burst.flushIfDue(999), { type: 'none' })
    })

    test('clearAfterExplicitPaste resets all transient state', () => {
        const burst = new PasteBurst()
        burst.onPlainChar('a', 1000)
        burst.onPlainChar('b', 1001)
        burst.appendCharToBuffer('b', 1001)

        burst.clearAfterExplicitPaste()
        assert.strictEqual(burst.isActive(), false)
        assert.strictEqual(burst.newlineShouldInsertInsteadOfSubmit(1002), false)
        assert.deepStrictEqual(burst.flushIfDue(1100), { type: 'none' })
    })

    test('flush timeout uses strict greater-than comparison', () => {
        const burst = new PasteBurst({ charIntervalMs: 5 })
        burst.onPlainChar('z', 0)

        assert.deepStrictEqual(burst.flushIfDue(5), { type: 'none' })
        assert.deepStrictEqual(burst.flushIfDue(6), { type: 'typed', text: 'z' })
    })
})
