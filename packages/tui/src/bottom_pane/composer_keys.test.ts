import assert from 'node:assert'
import { describe, test } from 'vitest'
import { resolveDeleteKind } from './composer_keys'

describe('composer_keys', () => {
    test('prefers explicit backspace flag', () => {
        assert.strictEqual(resolveDeleteKind('', { backspace: true, delete: true }), 'backspace')
    })

    test('maps delete flag to forward delete when no backspace signals', () => {
        assert.strictEqual(resolveDeleteKind('', { delete: true }), 'delete')
    })

    test('treats DEL control char as backspace', () => {
        assert.strictEqual(resolveDeleteKind('\u007f', {}), 'backspace')
        assert.strictEqual(resolveDeleteKind('\u007f', { delete: true }), 'backspace')
    })

    test('treats BS control char as backspace', () => {
        assert.strictEqual(resolveDeleteKind('\u0008', {}), 'backspace')
    })

    test('treats Ctrl+H as backspace', () => {
        assert.strictEqual(resolveDeleteKind('h', { ctrl: true }), 'backspace')
        assert.strictEqual(resolveDeleteKind('H', { ctrl: true }), 'backspace')
    })

    test('non delete-like input stays none', () => {
        assert.strictEqual(resolveDeleteKind('a', {}), 'none')
    })
})
