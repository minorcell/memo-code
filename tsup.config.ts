import { defineConfig } from 'tsup'
import { copyFileSync } from 'node:fs'
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
        // Copy prompt.md to dist directory
        copyFileSync(join('packages/core/src/runtime/prompt.md'), join('dist/prompt.md'))
        console.log('✓ Copied prompt.md to dist/')
    },
})
