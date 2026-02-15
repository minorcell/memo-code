import { defineConfig } from 'tsup'
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
    entry: {
        index: 'packages/tui/src/cli.tsx',
    },
    outDir: 'dist',
    format: ['esm'],
    target: 'node20',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: false,
    splitting: false,
    bundle: true,
    external: [],
    esbuildOptions(options) {
        options.jsx = 'automatic'
    },
    banner: {
        js: '#!/usr/bin/env node',
    },
    async onSuccess() {
        // Copy prompt.md to dist directory
        copyFileSync(join('packages/core/src/runtime/prompt.md'), join('dist/prompt.md'))
        mkdirSync(join('dist/task-prompts'), { recursive: true })
        cpSync(join('packages/tui/src/task-prompts'), join('dist/task-prompts'), {
            recursive: true,
        })
        const webServerDist = join('packages/web-server/dist')
        if (existsSync(webServerDist)) {
            const copiedServerDist = join('dist/web/server')
            mkdirSync(join('dist/web'), { recursive: true })
            cpSync(webServerDist, copiedServerDist, { recursive: true })
            writeFileSync(
                join(copiedServerDist, 'package.json'),
                `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
                'utf8',
            )
        }
        const webUiDist = join('packages/web-ui/dist')
        if (existsSync(webUiDist)) {
            mkdirSync(join('dist/web'), { recursive: true })
            cpSync(webUiDist, join('dist/web/ui'), { recursive: true })
            console.log('✓ Copied prompt.md, task prompts, and web server/ui assets to dist/')
            return
        }
        console.log('✓ Copied prompt.md and task prompts to dist/')
        console.warn('! web-ui dist not found, skipped copying dist/web/ui')
    },
})
