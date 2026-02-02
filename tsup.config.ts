import { defineConfig } from 'tsup'

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
})
