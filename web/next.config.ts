import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(currentDir, '..')

const nextConfig: NextConfig = {
    outputFileTracingRoot: workspaceRoot,
    turbopack: {
        root: workspaceRoot,
    },
}

export default nextConfig
