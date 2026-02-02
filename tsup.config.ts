import { defineConfig } from 'tsup'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
    entry: ['packages/cli/src/index.tsx'],
    outDir: 'dist',
    format: ['esm'],
    target: 'node18',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: true,
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
        // 复制 prompt.md 到 dist 目录
        copyFileSync(join('packages/core/src/runtime/prompt.md'), join('dist/prompt.md'))
        console.log('✓ Copied prompt.md to dist/')
    },
})
