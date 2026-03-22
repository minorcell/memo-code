import { request } from '@/api/request'
import type { WorkspaceFsListResult, WorkspaceRecord } from '@/api/types'

export function listWorkspaces() {
    return request<{ items: WorkspaceRecord[] }>({
        method: 'GET',
        url: '/api/workspaces',
    })
}

export function addWorkspace(params: { cwd: string; name?: string }) {
    return request<{ created: boolean; item: WorkspaceRecord }>({
        method: 'POST',
        url: '/api/workspaces',
        data: params,
    })
}

export function updateWorkspace(params: { workspaceId: string; name: string }) {
    return request<{ updated: boolean; item: WorkspaceRecord }>({
        method: 'PATCH',
        url: `/api/workspaces/${encodeURIComponent(params.workspaceId)}`,
        data: { name: params.name },
    })
}

export function removeWorkspace(params: { workspaceId: string }) {
    return request<{ deleted: boolean; deletedSessions?: number }>({
        method: 'DELETE',
        url: `/api/workspaces/${encodeURIComponent(params.workspaceId)}`,
    })
}

export function listWorkspaceDirectories(path?: string) {
    return request<WorkspaceFsListResult>({
        method: 'GET',
        url: '/api/workspaces/fs/list',
        params: path ? { path } : undefined,
    })
}
