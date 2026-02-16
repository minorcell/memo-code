import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    spawn: mocks.spawn,
}))

vi.mock('@memo/tools/runtime/context', () => ({
    getRuntimeCwd: () => '/runtime-cwd',
}))

import { grepFilesTool } from './grep_files'

type MockProc = EventEmitter & {
    stdout: EventEmitter & { setEncoding: (encoding: string) => void }
    stderr: EventEmitter & { setEncoding: (encoding: string) => void }
    kill: ReturnType<typeof vi.fn>
    exitCode: number | null
}

function textPayload(result: { content?: Array<{ type: string; text?: string }> }): string {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

function createProc(): MockProc {
    const proc = new EventEmitter() as MockProc
    const stdout = new EventEmitter() as MockProc['stdout']
    const stderr = new EventEmitter() as MockProc['stderr']
    stdout.setEncoding = vi.fn()
    stderr.setEncoding = vi.fn()
    proc.stdout = stdout
    proc.stderr = stderr
    proc.kill = vi.fn(() => true)
    proc.exitCode = null
    return proc
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('grep_files tool', () => {
    test('rejects blank pattern after trim', async () => {
        const result = await grepFilesTool.execute({ pattern: '  ' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('pattern must not be empty'))
    })

    test('returns no matches for exit code 1', async () => {
        mocks.spawn.mockImplementation(() => {
            const proc = createProc()
            process.nextTick(() => {
                proc.emit('close', 1)
            })
            return proc
        })

        const result = await grepFilesTool.execute({ pattern: 'needle', path: '/tmp' })
        assert.strictEqual(result.isError, false)
        assert.strictEqual(textPayload(result), 'No matches found.')
    })

    test('returns rg stderr for non-zero exit code', async () => {
        mocks.spawn.mockImplementation(() => {
            const proc = createProc()
            process.nextTick(() => {
                proc.stderr.emit('data', 'permission denied')
                proc.emit('close', 2)
            })
            return proc
        })

        const result = await grepFilesTool.execute({ pattern: 'needle', path: '/tmp' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('rg failed: permission denied'))
    })

    test('caps output lines to provided limit and passes include glob to rg', async () => {
        mocks.spawn.mockImplementation((_cmd: string, args: string[]) => {
            expect(args).toContain('--glob')
            expect(args).toContain('*.ts')

            const proc = createProc()
            process.nextTick(() => {
                proc.stdout.emit('data', 'a.ts\nb.ts\nc.ts\n')
                proc.emit('close', 0)
            })
            return proc
        })

        const result = await grepFilesTool.execute({
            pattern: 'needle',
            include: '*.ts',
            limit: 2,
            path: '/tmp',
        })

        assert.strictEqual(result.isError, false)
        assert.strictEqual(textPayload(result), 'a.ts\nb.ts')
    })

    test('handles spawn errors', async () => {
        mocks.spawn.mockImplementation(() => {
            const proc = createProc()
            process.nextTick(() => {
                proc.emit('error', new Error('spawn rg ENOENT'))
            })
            return proc
        })

        const result = await grepFilesTool.execute({ pattern: 'needle', path: '/tmp' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('grep_files failed: spawn rg ENOENT'))
    })

    test('times out and reports timeout error', async () => {
        vi.useFakeTimers()

        const spawned: MockProc[] = []
        mocks.spawn.mockImplementation(() => {
            const proc = createProc()
            proc.kill.mockImplementation(() => {
                process.nextTick(() => {
                    proc.emit('close', 0)
                })
                return true
            })
            spawned.push(proc)
            return proc
        })

        const pending = grepFilesTool.execute({ pattern: 'slow-pattern', path: '/tmp' })
        await vi.advanceTimersByTimeAsync(30_100)
        const result = await pending

        assert.strictEqual(spawned.length, 1)
        assert.strictEqual(spawned[0]?.kill.mock.calls.length, 1)
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('rg timed out after 30 seconds'))
    })
})
