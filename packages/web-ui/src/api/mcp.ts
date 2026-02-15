import { wsRequest } from '@/api/ws-client'
import type { McpServerConfig, McpServerRecord } from '@/api/types'

export function getMcpServers() {
    return wsRequest<{ items: McpServerRecord[] }>('mcp.servers.list', {})
}

export function getMcpServer(name: string) {
    return wsRequest<McpServerRecord>('mcp.servers.get', { name })
}

export function createMcpServer(name: string, config: McpServerConfig) {
    return wsRequest<{ created: true }>('mcp.servers.create', { name, config })
}

export function updateMcpServer(name: string, config: McpServerConfig) {
    return wsRequest<{ updated: true }>('mcp.servers.update', { name, config })
}

export function removeMcpServer(name: string) {
    return wsRequest<{ deleted: true }>('mcp.servers.remove', { name })
}

export function loginMcpServer(name: string, scopes?: string[]) {
    return wsRequest<{ loggedIn: true }>('mcp.servers.login', {
        name,
        ...(scopes && scopes.length > 0 ? { scopes } : {}),
    })
}

export function logoutMcpServer(name: string) {
    return wsRequest<{ loggedOut: true }>('mcp.servers.logout', { name })
}

export function setActiveMcpServers(names: string[]) {
    return wsRequest<{ active: string[] }>('mcp.active.set', { names })
}
