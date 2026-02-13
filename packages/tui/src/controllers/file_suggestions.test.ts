import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'vitest'
import { getFileSuggestions, invalidateFileSuggestionCache } from './file_suggestions'

const cleanupDirs: string[] = []

async function createFixtureWorkspace(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'memo-file-suggestions-'))
    cleanupDirs.push(root)

    await mkdir(join(root, 'site', 'out'), { recursive: true })
    await mkdir(join(root, 'out'), { recursive: true })
    await mkdir(join(root, 'src'), { recursive: true })

    await writeFile(join(root, '.gitignore'), 'out\n', 'utf8')
    await writeFile(join(root, 'src', 'app.ts'), 'export const app = true\n', 'utf8')
    await writeFile(join(root, 'site', 'out', 'bundle.js'), 'console.log("bundle")\n', 'utf8')
    await writeFile(join(root, 'out', 'artifact.txt'), 'artifact\n', 'utf8')

    return root
}

function toPaths(results: Awaited<ReturnType<typeof getFileSuggestions>>): string[] {
    return results.map((item) => item.path)
}

afterEach(async () => {
    invalidateFileSuggestionCache()
    while (cleanupDirs.length > 0) {
        const dir = cleanupDirs.pop()
        if (!dir) continue
        await rm(dir, { recursive: true, force: true })
    }
})

describe('getFileSuggestions', () => {
    test('respects .gitignore rules by default', async () => {
        const cwd = await createFixtureWorkspace()
        const suggestions = await getFileSuggestions({
            cwd,
            query: '',
            limit: 200,
            maxDepth: 8,
        })
        const paths = toPaths(suggestions)

        assert.ok(paths.includes('src/app.ts'))
        assert.ok(!paths.includes('out'))
        assert.ok(!paths.includes('out/artifact.txt'))
        assert.ok(!paths.includes('site/out'))
        assert.ok(!paths.includes('site/out/bundle.js'))
    })

    test('can opt out from .gitignore filtering', async () => {
        const cwd = await createFixtureWorkspace()
        const suggestions = await getFileSuggestions({
            cwd,
            query: '',
            limit: 200,
            maxDepth: 8,
            respectGitIgnore: false,
        })
        const paths = toPaths(suggestions)

        assert.ok(paths.includes('out'))
        assert.ok(paths.includes('out/artifact.txt'))
        assert.ok(paths.includes('site/out'))
        assert.ok(paths.includes('site/out/bundle.js'))
    })
})
