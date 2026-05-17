import { defineConfig } from 'tsup'
import { copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const WEBFETCH_EXTERNALS = [
    '@mozilla/readability',
    'ipaddr.js',
    'jsdom',
    'robots-parser',
    'turndown',
    'undici',
]

export default defineConfig({
    entry: {
        index: 'packages/tui/src/cli.tsx',
    },
    outDir: 'dist',
    format: ['esm'],
    target: 'node22',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: false,
    splitting: false,
    bundle: true,
    external: WEBFETCH_EXTERNALS,
    esbuildOptions(options) {
        options.jsx = 'automatic'
    },
    banner: {
        js: '#!/usr/bin/env node',
    },
    async onSuccess() {
        copyFileSync(join('packages/core/src/runtime/prompt.md'), join('dist/prompt.md'))
        mkdirSync(join('dist/task-prompts'), { recursive: true })
        cpSync(join('packages/tui/src/task-prompts'), join('dist/task-prompts'), {
            recursive: true,
        })
        console.log('✓ Copied prompt.md and task prompts to dist/')
    },
})
