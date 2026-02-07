import type { McpClientPool } from './pool'

let activePool: McpClientPool | null = null

export function setActiveMcpPool(pool: McpClientPool | null) {
    activePool = pool
}

export function getActiveMcpPool(): McpClientPool | null {
    return activePool
}
