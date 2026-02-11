import assert from 'node:assert'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, test } from 'vitest'
import { normalizePath, isWritePathAllowed, writePathDenyReason } from '@memo/tools/tools/helpers'

describe('helpers.normalizePath', () => {
    test('normalizes relative paths to absolute', () => {
        const normalized = normalizePath('./tmp/../tmp/file.txt')
        assert.ok(normalized.endsWith('/tmp/file.txt') || normalized.endsWith('\\tmp\\file.txt'))
        assert.ok(normalized.startsWith('/'), 'should be absolute path')
    })
})

describe('helpers.sandbox', () => {
    test('allows write path under configured writable roots', () => {
        const prev = process.env.MEMO_SANDBOX_WRITABLE_ROOTS
        const root = join(tmpdir(), `memo-sandbox-${crypto.randomUUID()}`)
        process.env.MEMO_SANDBOX_WRITABLE_ROOTS = root
        try {
            const target = join(root, 'a.txt')
            assert.strictEqual(isWritePathAllowed(normalizePath(target)), true)
        } finally {
            if (prev === undefined) delete process.env.MEMO_SANDBOX_WRITABLE_ROOTS
            else process.env.MEMO_SANDBOX_WRITABLE_ROOTS = prev
        }
    })

    test('denies write path outside writable roots', () => {
        const prev = process.env.MEMO_SANDBOX_WRITABLE_ROOTS
        const root = join(tmpdir(), `memo-sandbox-${crypto.randomUUID()}`)
        process.env.MEMO_SANDBOX_WRITABLE_ROOTS = root
        try {
            const outside = normalizePath('/etc/passwd')
            assert.strictEqual(isWritePathAllowed(outside), false)
            const reason = writePathDenyReason(outside) ?? ''
            assert.ok(reason.includes('sandbox write denied'))
            assert.ok(reason.includes('is not within allowed directories'))
        } finally {
            if (prev === undefined) delete process.env.MEMO_SANDBOX_WRITABLE_ROOTS
            else process.env.MEMO_SANDBOX_WRITABLE_ROOTS = prev
        }
    })
})
