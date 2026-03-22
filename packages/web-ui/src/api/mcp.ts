import { request } from '@/api/request'
import type { McpServerConfig, McpServerRecord } from '@/api/types'

export function getMcpServers() {
    return request<{ items: McpServerRecord[] }>({
        method: 'GET',
        url: '/api/mcp/servers',
    })
}

export function getMcpServer(name: string) {
    return request<McpServerRecord>({
        method: 'GET',
        url: `/api/mcp/servers/${encodeURIComponent(name)}`,
    })
}

export function createMcpServer(name: string, config: McpServerConfig) {
    return request<{ created: true }>({
        method: 'POST',
        url: '/api/mcp/servers',
        data: { name, config },
    })
}

export function updateMcpServer(name: string, config: McpServerConfig) {
    return request<{ updated: true }>({
        method: 'PUT',
        url: `/api/mcp/servers/${encodeURIComponent(name)}`,
        data: { config },
    })
}

export function removeMcpServer(name: string) {
    return request<{ deleted: true }>({
        method: 'DELETE',
        url: `/api/mcp/servers/${encodeURIComponent(name)}`,
    })
}

export function loginMcpServer(name: string, scopes?: string[]) {
    return request<{ loggedIn: true }>({
        method: 'POST',
        url: `/api/mcp/servers/${encodeURIComponent(name)}/login`,
        data: scopes && scopes.length > 0 ? { scopes } : {},
    })
}

export function logoutMcpServer(name: string) {
    return request<{ loggedOut: true }>({
        method: 'POST',
        url: `/api/mcp/servers/${encodeURIComponent(name)}/logout`,
        data: {},
    })
}

export function setActiveMcpServers(names: string[]) {
    return request<{ active: string[] }>({
        method: 'POST',
        url: '/api/mcp/active',
        data: { names },
    })
}
