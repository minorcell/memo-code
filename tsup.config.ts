import { defineConfig } from 'tsup'
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
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
    external: ['@mozilla/readability', 'ipaddr.js', 'jsdom', 'robots-parser', 'turndown', 'undici'],
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
        const webUiDist = join('packages/web-ui/dist')
        if (existsSync(webUiDist)) {
            mkdirSync(join('dist/web'), { recursive: true })
            cpSync(webUiDist, join('dist/web/ui'), { recursive: true })
            console.log('✓ Copied prompt.md, task prompts, and web UI assets to dist/')
            return
        }
        console.log('✓ Copied prompt.md and task prompts to dist/')
        console.warn('! web-ui dist not found, skipped copying dist/web/ui')
    },
})
