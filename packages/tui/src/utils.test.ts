import assert from 'node:assert'
import path from 'node:path'
import { describe, test } from 'vitest'
import { looksLikePathInput, toRelativeDisplayPath } from './utils'

describe('path display helpers', () => {
    const cwd = path.join('/tmp', 'memo-cli')

    test('converts cwd absolute path to dot', () => {
        assert.strictEqual(toRelativeDisplayPath(cwd, cwd), '.')
    })

    test('converts absolute path under cwd to relative', () => {
        const filePath = path.join(cwd, 'package.json')
        assert.strictEqual(toRelativeDisplayPath(filePath, cwd), 'package.json')
    })

    test('normalizes relative dot inputs', () => {
        assert.strictEqual(toRelativeDisplayPath('.', cwd), '.')
        assert.strictEqual(toRelativeDisplayPath('./', cwd), '.')
    })

    test('keeps non-path strings untouched', () => {
        assert.strictEqual(toRelativeDisplayPath('pwd', cwd), 'pwd')
        assert.strictEqual(looksLikePathInput('pwd'), false)
    })

    test('detects path-like strings', () => {
        assert.strictEqual(looksLikePathInput('.'), true)
        assert.strictEqual(looksLikePathInput('./README.md'), true)
        assert.strictEqual(looksLikePathInput('/tmp/memo-cli'), true)
    })
})
