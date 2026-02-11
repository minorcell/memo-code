import assert from 'node:assert'
import { describe, test } from 'vitest'
import { resolveDeleteKind } from './composer_keys'

describe('composer_keys', () => {
    test('prefers explicit backspace flag', () => {
        assert.strictEqual(resolveDeleteKind('', { backspace: true, delete: true }), 'backspace')
    })

    test('treats delete flag as backspace by default (ink compatibility)', () => {
        assert.strictEqual(resolveDeleteKind('', { delete: true }), 'backspace')
    })

    test('supports forward delete via modified delete key', () => {
        assert.strictEqual(resolveDeleteKind('', { delete: true, ctrl: true }), 'delete')
        assert.strictEqual(resolveDeleteKind('', { delete: true, meta: true }), 'delete')
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
