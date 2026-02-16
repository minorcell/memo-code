import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm', 'cjs'],
    target: 'node20',
    dts: true,
    clean: true,
    sourcemap: false,
    minify: false,
    splitting: false,
    bundle: true,
    external: ['@dqbd/tiktoken'],
})
