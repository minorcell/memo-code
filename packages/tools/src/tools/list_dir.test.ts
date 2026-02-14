import assert from 'node:assert'
import { mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, test, beforeAll, afterAll, expect } from 'vitest'
import { listDirTool } from './list_dir'
import { flattenText } from './mcp'

let tempDir: string
let uniqueId: string

async function makeTempDir(prefix: string) {
    const dir = join(tmpdir(), `${prefix}-${uniqueId}`)
    await mkdir(dir, { recursive: true })
    return dir
}

beforeAll(async () => {
    uniqueId = crypto.randomUUID()
    tempDir = await makeTempDir('memo-tools-list-dir')
})

afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
})

describe('list_dir tool', () => {
    describe('basic functionality', () => {
        test('lists directory entries', async () => {
            await mkdir(join(tempDir, 'subdir'))
            await writeFile(join(tempDir, 'file.txt'), 'content', 'utf8')

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('subdir/'))
            assert.ok(output.includes('file.txt'))
        })

        test('shows absolute path in output', async () => {
            await writeFile(join(tempDir, 'test.txt'), 'content', 'utf8')

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('Absolute path:'))
            assert.ok(output.includes(tempDir))
        })
    })

    describe('file type indicators', () => {
        test('adds / suffix for directories', async () => {
            await mkdir(join(tempDir, 'myfolder'))

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            assert.ok(flattenText(result).includes('myfolder/'))
        })

        test('adds @ suffix for symlinks', async () => {
            const symlinkPath = join(tempDir, 'link')
            const targetPath = join(tempDir, 'target')
            await writeFile(targetPath, 'target', 'utf8')
            await symlink(targetPath, symlinkPath)

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            assert.ok(flattenText(result).includes('link@'))
        })
    })

    describe('pagination', () => {
        test('respects offset parameter', async () => {
            for (let i = 1; i <= 5; i++) {
                await writeFile(join(tempDir, `file${i}.txt`), `content${i}`, 'utf8')
            }

            const result = await listDirTool.execute({ dir_path: tempDir, offset: 3, limit: 10 })

            const output = flattenText(result)
            assert.ok(output.includes('file3.txt'))
            assert.ok(output.includes('file4.txt'))
            assert.ok(output.includes('file5.txt'))
        })

        test('respects limit parameter', async () => {
            for (let i = 1; i <= 10; i++) {
                await writeFile(join(tempDir, `limit${i}.txt`), `content${i}`, 'utf8')
            }

            const result = await listDirTool.execute({ dir_path: tempDir, limit: 5 })

            const output = flattenText(result)
            assert.ok(output.includes('More than 5 entries found'))
        })

        test('shows More than N entries indicator', async () => {
            for (let i = 1; i <= 20; i++) {
                await writeFile(join(tempDir, `page${i}.txt`), `content${i}`, 'utf8')
            }

            const result = await listDirTool.execute({ dir_path: tempDir, limit: 10 })

            const output = flattenText(result)
            assert.ok(output.includes('More than 10 entries found'))
        })
    })

    describe('depth parameter', () => {
        test('respects depth parameter for nested directories', async () => {
            const depthDir = await makeTempDir('depth-test')
            await mkdir(join(depthDir, 'level1'), { recursive: true })
            await mkdir(join(depthDir, 'level1', 'level2'), { recursive: true })
            await writeFile(join(depthDir, 'root.txt'), 'root', 'utf8')
            await writeFile(join(depthDir, 'level1', 'l1.txt'), 'l1', 'utf8')
            await writeFile(join(depthDir, 'level1', 'level2', 'l2.txt'), 'l2', 'utf8')

            const result = await listDirTool.execute({ dir_path: depthDir, depth: 2 })

            const output = flattenText(result)
            assert.ok(output.includes('level1/'))
            assert.ok(output.includes('level2/'))
            assert.ok(!output.includes('l2.txt'))

            await rm(depthDir, { recursive: true, force: true })
        })

        test('depth=1 shows only immediate children', async () => {
            const depthDir = await makeTempDir('depth-1-test')
            await mkdir(join(depthDir, 'a'), { recursive: true })
            await writeFile(join(depthDir, 'a', 'nested.txt'), 'nested', 'utf8')
            await writeFile(join(depthDir, 'top.txt'), 'top', 'utf8')

            const result = await listDirTool.execute({ dir_path: depthDir, depth: 1 })

            const output = flattenText(result)
            assert.ok(output.includes('a/'))
            assert.ok(output.includes('top.txt'))
            assert.ok(!output.includes('nested.txt'))

            await rm(depthDir, { recursive: true, force: true })
        })

        test('large depth covers all nested levels', async () => {
            const depthDir = await makeTempDir('deep-test')
            let current = depthDir
            for (let i = 1; i <= 5; i++) {
                current = join(current, `level${i}`)
                await mkdir(current, { recursive: true })
                await writeFile(join(current, `file${i}.txt`), `level${i}`, 'utf8')
            }

            const result = await listDirTool.execute({ dir_path: depthDir, depth: 10 })

            const output = flattenText(result)
            for (let i = 1; i <= 5; i++) {
                assert.ok(output.includes(`file${i}.txt`), `file${i}.txt should be visible`)
            }

            await rm(depthDir, { recursive: true, force: true })
        })
    })

    describe('sorting', () => {
        test('sorts entries alphabetically', async () => {
            const sortDir = await makeTempDir('sort-test')
            await writeFile(join(sortDir, 'zebra.txt'), 'z', 'utf8')
            await writeFile(join(sortDir, 'apple.txt'), 'a', 'utf8')
            await writeFile(join(sortDir, 'mango.txt'), 'm', 'utf8')

            const result = await listDirTool.execute({ dir_path: sortDir })

            const output = flattenText(result)
            const appleIdx = output.indexOf('apple.txt')
            const mangoIdx = output.indexOf('mango.txt')
            const zebraIdx = output.indexOf('zebra.txt')
            assert.ok(appleIdx < mangoIdx, 'apple should come before mango')
            assert.ok(mangoIdx < zebraIdx, 'mango should come before zebra')

            await rm(sortDir, { recursive: true, force: true })
        })

        test('directories appear before files', async () => {
            const sortDir = await makeTempDir('dir-file-test')
            await writeFile(join(sortDir, 'z-file.txt'), 'z', 'utf8')
            await mkdir(join(sortDir, 'a-dir'))

            const result = await listDirTool.execute({ dir_path: sortDir })

            const output = flattenText(result)
            const dirIdx = output.indexOf('a-dir/')
            const fileIdx = output.indexOf('z-file.txt')
            assert.ok(dirIdx < fileIdx, 'directories should appear before files')

            await rm(sortDir, { recursive: true, force: true })
        })
    })

    describe('error handling', () => {
        test('returns error for relative paths', async () => {
            const result = await listDirTool.execute({ dir_path: './relative' })

            assert.strictEqual(result.isError, true)
            assert.ok(flattenText(result).includes('absolute path'))
        })

        test('returns error for invalid offset', async () => {
            const result = await listDirTool.execute({ dir_path: tempDir, offset: 0 })

            assert.strictEqual(result.isError, true)
            assert.ok(flattenText(result).includes('1-indexed'))
        })

        test('returns error when offset exceeds entry count', async () => {
            const result = await listDirTool.execute({ dir_path: tempDir, offset: 99999 })

            assert.strictEqual(result.isError, true)
            assert.ok(flattenText(result).includes('offset exceeds'))
        })

        test('returns error for non-existent directory', async () => {
            const result = await listDirTool.execute({ dir_path: '/nonexistent/path/12345' })

            assert.strictEqual(result.isError, true)
            assert.ok(flattenText(result).includes('list_dir failed'))
        })
    })

    describe('edge cases', () => {
        test('handles empty directory', async () => {
            const emptyDir = await makeTempDir('empty-list')
            const result = await listDirTool.execute({ dir_path: emptyDir })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('Absolute path:'))
            assert.ok(!output.includes('More than'))

            await rm(emptyDir, { recursive: true, force: true })
        })

        test('handles hidden files (dotfiles)', async () => {
            await writeFile(join(tempDir, '.hidden'), 'hidden content', 'utf8')
            await writeFile(join(tempDir, '.config.json'), '{"hidden": true}', 'utf8')

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('.hidden'))
            assert.ok(output.includes('.config.json'))
        })

        test('handles files with spaces and special characters', async () => {
            await writeFile(join(tempDir, 'file with spaces.txt'), 'content', 'utf8')
            await writeFile(join(tempDir, 'file-with-dashes.txt'), 'content', 'utf8')
            await writeFile(join(tempDir, 'file_with_underscores.txt'), 'content', 'utf8')

            const result = await listDirTool.execute({ dir_path: tempDir })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('file with spaces.txt'))
            assert.ok(output.includes('file-with-dashes.txt'))
            assert.ok(output.includes('file_with_underscores.txt'))
        })

        test('handles many files efficiently', async () => {
            const manyDir = await makeTempDir('many-files')
            for (let i = 0; i < 100; i++) {
                await writeFile(join(manyDir, `file${i}.txt`), `content${i}`, 'utf8')
            }

            const result = await listDirTool.execute({ dir_path: manyDir, limit: 25 })

            assert.strictEqual(result.isError, false)
            const output = flattenText(result)
            assert.ok(output.includes('More than 25 entries found'))

            await rm(manyDir, { recursive: true, force: true })
        })
    })
})
