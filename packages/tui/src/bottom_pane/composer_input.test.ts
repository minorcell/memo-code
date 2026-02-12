import assert from 'node:assert'
import { describe, test } from 'vitest'
import {
    backspaceAtCursor,
    clampCursorToBoundary,
    deleteAtCursor,
    deleteToLineEnd,
    deleteToLineStart,
    deleteWordBackwardAtCursor,
    getCursorLayout,
    getWrappedCursorLayout,
    insertAtCursor,
    moveCursorLeft,
    moveCursorRight,
    moveCursorToLineEnd,
    moveCursorToLineStart,
    moveCursorVertical,
} from './composer_input'

describe('composer_input', () => {
    test('inserts text at cursor', () => {
        const next = insertAtCursor('hello world', 5, ', brave')
        assert.deepStrictEqual(next, { value: 'hello, brave world', cursor: 12 })
    })

    test('normalizes pasted CRLF and CR line endings', () => {
        const next = insertAtCursor('', 0, '- a\r\n- b\r- c')
        assert.deepStrictEqual(next, { value: '- a\n- b\n- c', cursor: 11 })
    })

    test('backspace and delete respect unicode code points', () => {
        const source = 'a🙂b'
        const backspaced = backspaceAtCursor(source, 3)
        assert.deepStrictEqual(backspaced, { value: 'ab', cursor: 1 })

        const deleted = deleteAtCursor(source, 1)
        assert.deepStrictEqual(deleted, { value: 'ab', cursor: 1 })
    })

    test('word delete removes contiguous word before cursor', () => {
        const next = deleteWordBackwardAtCursor('hello world', 11)
        assert.deepStrictEqual(next, { value: 'hello ', cursor: 6 })
    })

    test('line-start and line-end deletions keep cursor stable', () => {
        const fromMiddle = deleteToLineStart('aa\nbb\ncc', 5)
        assert.deepStrictEqual(fromMiddle, { value: 'aa\n\ncc', cursor: 3 })

        const toEnd = deleteToLineEnd('aa\nbb\ncc', 4)
        assert.deepStrictEqual(toEnd, { value: 'aa\nb\ncc', cursor: 4 })
    })

    test('left and right cursor movement handles surrogate pairs', () => {
        const text = 'x🙂y'
        assert.strictEqual(moveCursorRight(text, 1), 3)
        assert.strictEqual(moveCursorLeft(text, 3), 1)
    })

    test('line start and end movement uses current line', () => {
        const text = 'abc\ndef\nxyz'
        assert.strictEqual(moveCursorToLineStart(text, 5), 4)
        assert.strictEqual(moveCursorToLineEnd(text, 5), 7)
    })

    test('vertical movement preserves preferred column', () => {
        const text = 'abcdef\nxy\n123456'
        const up = moveCursorVertical(text, 9, 'up')
        assert.deepStrictEqual(up, { cursor: 2, preferredColumn: 2, changed: true })

        const down = moveCursorVertical(text, up.cursor, 'down', up.preferredColumn)
        assert.deepStrictEqual(down, { cursor: 9, preferredColumn: 2, changed: true })
    })

    test('cursor layout supports trailing newline', () => {
        const layout = getCursorLayout('line1\n', 6)
        assert.deepStrictEqual(layout.lines, ['line1', ''])
        assert.strictEqual(layout.row, 1)
        assert.strictEqual(layout.column, 0)
    })

    test('clamps cursor to valid char boundary', () => {
        const value = '🙂a'
        assert.strictEqual(clampCursorToBoundary(value, 1), 0)
        assert.strictEqual(clampCursorToBoundary(value, 99), value.length)
    })

    test('wrapped layout tracks soft-wrapped rows by terminal width', () => {
        const layout = getWrappedCursorLayout('abcdef', 4, 3)
        assert.deepStrictEqual(
            layout.lines.map((line) => line.text),
            ['abc', 'def'],
        )
        assert.strictEqual(layout.row, 1)
        assert.strictEqual(layout.cursorInRow, 1)
    })

    test('wrapped layout handles cjk wide chars', () => {
        const value = '你好abc'
        const layout = getWrappedCursorLayout(value, value.length, 4)
        assert.deepStrictEqual(
            layout.lines.map((line) => line.text),
            ['你好', 'abc'],
        )
        assert.strictEqual(layout.row, 1)
        assert.strictEqual(layout.cursorInRow, 3)
    })

    test('wrapped layout preserves explicit newline boundaries', () => {
        const layout = getWrappedCursorLayout('ab\ncd', 3, 2)
        assert.deepStrictEqual(
            layout.lines.map((line) => line.text),
            ['ab', 'cd'],
        )
        assert.strictEqual(layout.row, 1)
        assert.strictEqual(layout.cursorInRow, 0)
    })
})
