import assert from 'node:assert'
import path from 'node:path'
import { describe, test } from 'vitest'
import { getMainParam } from './StepView'

describe('getMainParam', () => {
    test('formats absolute file paths as workspace-relative paths', () => {
        const cwd = path.join(path.sep, 'tmp', 'memo-cli')
        const filePath = path.join(cwd, 'web', 'public', 'logo.svg')

        const param = getMainParam({ file_path: filePath }, cwd)
        assert.strictEqual(param, 'web/public/logo.svg')
    })

    test('keeps absolute paths unchanged when outside workspace', () => {
        const cwd = path.join(path.sep, 'tmp', 'memo-cli')
        const outsidePath = path.join(path.sep, 'tmp', 'other', 'logo.svg')

        const param = getMainParam({ file_path: outsidePath }, cwd)
        assert.strictEqual(param, outsidePath)
    })

    test('formats absolute string input as workspace-relative path', () => {
        const cwd = path.join(path.sep, 'tmp', 'memo-cli')
        const filePath = path.join(cwd, 'README.md')

        const param = getMainParam(filePath, cwd)
        assert.strictEqual(param, 'README.md')
    })

    test('formats cwd absolute path as dot', () => {
        const cwd = path.join(path.sep, 'tmp', 'memo-cli')
        const param = getMainParam({ dir_path: cwd }, cwd)
        assert.strictEqual(param, '.')
    })
})
