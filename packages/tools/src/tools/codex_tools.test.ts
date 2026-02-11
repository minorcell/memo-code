import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, test } from 'vitest'
import { execCommandTool } from '@memo/tools/tools/exec_command'
import { writeStdinTool } from '@memo/tools/tools/write_stdin'
import { applyPatchTool } from '@memo/tools/tools/apply_patch'
import { readFileTool } from '@memo/tools/tools/read_file'
import { listDirTool } from '@memo/tools/tools/list_dir'
import { grepFilesTool } from '@memo/tools/tools/grep_files'
import { updatePlanTool } from '@memo/tools/tools/update_plan'
import { getMemoryTool } from '@memo/tools/tools/get_memory'

let tempDir: string
let prevWritableRoots: string | undefined
let prevMemoHome: string | undefined

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`)
    await mkdir(dir, { recursive: true })
    return dir
}

async function readText(path: string) {
    try {
        await access(path)
        return await readFile(path, 'utf8')
    } catch {
        return ''
    }
}

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    const first = result.content?.find((item) => item.type === 'text')
    return first?.text ?? ''
}

function outputPayload(text: string) {
    const marker = 'Output:\n'
    const index = text.indexOf(marker)
    if (index < 0) return ''
    return text.slice(index + marker.length)
}

beforeAll(async () => {
    tempDir = await makeTempDir('memo-tools-codex')
    prevWritableRoots = process.env.MEMO_SANDBOX_WRITABLE_ROOTS
    prevMemoHome = process.env.MEMO_HOME
    process.env.MEMO_SANDBOX_WRITABLE_ROOTS = tempDir
    process.env.MEMO_HOME = tempDir
})

afterAll(async () => {
    if (prevWritableRoots === undefined) {
        delete process.env.MEMO_SANDBOX_WRITABLE_ROOTS
    } else {
        process.env.MEMO_SANDBOX_WRITABLE_ROOTS = prevWritableRoots
    }
    if (prevMemoHome === undefined) {
        delete process.env.MEMO_HOME
    } else {
        process.env.MEMO_HOME = prevMemoHome
    }
    await rm(tempDir, { recursive: true, force: true })
})

describe('codex shell family', () => {
    test('exec_command runs command and returns formatted output', async () => {
        const result = await execCommandTool.execute({ cmd: 'echo hello-codex' })
        const text = textPayload(result)
        assert.ok(text.includes('Output:'), 'should contain output section')
        assert.ok(text.includes('hello-codex'), 'should include command output')
    })

    test('exec_command blocks dangerous shell command with xml hint', async () => {
        const result = await execCommandTool.execute({ cmd: 'rm -rf /' })
        const text = textPayload(result)

        assert.ok(text.startsWith('<system_hint '))
        assert.ok(text.includes('reason="dangerous_command"'))
        assert.ok(text.includes('tool="exec_command"'))
    })

    test('write_stdin continues interactive session', async () => {
        const started = await execCommandTool.execute({
            cmd: 'read line; echo "$line"',
            yield_time_ms: 50,
        })
        const startedText = textPayload(started)
        const match = startedText.match(/session ID (\d+)/)
        assert.ok(match, `expected running session id, got: ${startedText}`)

        const sessionId = Number(match?.[1])
        const resumed = await writeStdinTool.execute({
            session_id: sessionId,
            chars: 'interactive-ok\n',
            yield_time_ms: 1000,
        })

        const resumedText = textPayload(resumed)
        assert.ok(resumedText.includes('interactive-ok'))
    })

    test('write_stdin blocks dangerous input and keeps session alive', async () => {
        const started = await execCommandTool.execute({
            cmd: 'read line; echo "$line"',
            yield_time_ms: 50,
        })
        const startedText = textPayload(started)
        const match = startedText.match(/session ID (\d+)/)
        assert.ok(match, `expected running session id, got: ${startedText}`)

        const sessionId = Number(match?.[1])
        const blocked = await writeStdinTool.execute({
            session_id: sessionId,
            chars: 'rm -rf /\n',
            yield_time_ms: 50,
        })
        const blockedText = textPayload(blocked)
        assert.ok(blockedText.startsWith('<system_hint '))
        assert.ok(blockedText.includes('tool="write_stdin"'))

        const resumed = await writeStdinTool.execute({
            session_id: sessionId,
            chars: 'still-alive\n',
            yield_time_ms: 1000,
        })
        const resumedText = textPayload(resumed)
        assert.ok(resumedText.includes('still-alive'))
    })

    test('write_stdin can fetch unread output tail after truncation', async () => {
        const started = await execCommandTool.execute({
            cmd: `node -e "process.stdout.write('X'.repeat(5000)); setTimeout(() => {}, 2000)"`,
            yield_time_ms: 300,
            max_output_tokens: 10,
        })
        const startedText = textPayload(started)
        const match = startedText.match(/session ID (\d+)/)
        assert.ok(match, `expected running session id, got: ${startedText}`)
        const firstChunk = outputPayload(startedText)
        assert.strictEqual(firstChunk.length, 40)

        const sessionId = Number(match?.[1])
        const next = await writeStdinTool.execute({
            session_id: sessionId,
            yield_time_ms: 100,
            max_output_tokens: 2000,
        })
        const nextText = textPayload(next)
        const nextChunk = outputPayload(nextText)
        assert.ok(nextChunk.length > 0, `expected unread tail, got: ${nextText}`)
        assert.ok(nextChunk.includes('X'))
    })
})

describe('codex file/search family', () => {
    test('apply_patch supports direct replace flow', async () => {
        const target = join(tempDir, 'patched.txt')
        await writeFile(target, 'alpha beta alpha', 'utf8')

        const singleRes = await applyPatchTool.execute({
            file_path: target,
            old_string: 'alpha',
            new_string: 'A',
        })
        assert.ok(!singleRes.isError)
        assert.strictEqual(await readText(target), 'A beta alpha')

        const batchRes = await applyPatchTool.execute({
            file_path: target,
            edits: [
                { old_string: 'beta', new_string: 'B' },
                { old_string: 'alpha', new_string: 'A', replace_all: true },
            ],
        })
        assert.ok(!batchRes.isError)
        assert.strictEqual(await readText(target), 'A B A')
    })

    test('read_file requires absolute path', async () => {
        const result = await readFileTool.execute({ file_path: 'relative.txt' })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('absolute'))
    })

    test('list_dir lists entries with absolute path header', async () => {
        const nested = join(tempDir, 'list-dir')
        await mkdir(nested, { recursive: true })
        await writeFile(join(nested, 'a.txt'), 'a', 'utf8')

        const result = await listDirTool.execute({ dir_path: nested })
        const text = textPayload(result)
        assert.ok(text.includes('Absolute path:'), 'should include header')
        assert.ok(text.includes('a.txt'), 'should include file name')
    })

    test('grep_files returns matching file paths', async () => {
        const rgAvailable = spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0
        if (!rgAvailable) return

        const searchRoot = join(tempDir, 'grep-files')
        await mkdir(searchRoot, { recursive: true })
        await writeFile(join(searchRoot, 'm1.txt'), 'needle-here', 'utf8')
        await writeFile(join(searchRoot, 'm2.txt'), 'nothing', 'utf8')

        const result = await grepFilesTool.execute({ pattern: 'needle-here', path: searchRoot })
        const text = textPayload(result)
        assert.ok(text.includes('m1.txt'))
    })
})

describe('codex workflow/context tools', () => {
    test('update_plan rejects multiple in_progress items', async () => {
        const result = await updatePlanTool.execute({
            plan: [
                { step: 'a', status: 'in_progress' },
                { step: 'b', status: 'in_progress' },
            ],
        })
        assert.strictEqual(result.isError, true)
        assert.ok(textPayload(result).includes('in_progress'))
    })

    test('get_memory reads from MEMO_HOME Agents.md', async () => {
        const memoryPath = join(tempDir, 'Agents.md')
        await writeFile(memoryPath, '## Memo Added Memories\n\n- prefers concise answers\n', 'utf8')
        const result = await getMemoryTool.execute({ memory_id: 'thread-1' })
        const text = textPayload(result)
        assert.ok(text.includes('prefers concise answers'))
    })
})
