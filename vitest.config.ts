import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            all: false,
            include: ['packages/*/src/**/*.{ts,tsx}'],
            exclude: ['**/*.d.ts', '**/*.test.{ts,tsx}', 'packages/core/src/types.ts'],
            reporter: ['text', 'lcov'],
            reportsDirectory: './coverage',
            thresholds: {
                statements: 70,
                branches: 70,
                functions: 70,
                lines: 70,
            },
        },
    },
    plugins: [tsconfigPaths()],
})
