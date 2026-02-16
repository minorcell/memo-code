import { wsRequest } from '@/api/ws-client'
import type { WorkspaceFsListResult, WorkspaceRecord } from '@/api/types'

export function listWorkspaces() {
    return wsRequest<{ items: WorkspaceRecord[] }>('workspace.list', {})
}

export function addWorkspace(params: { cwd: string; name?: string }) {
    return wsRequest<{ created: boolean; item: WorkspaceRecord }>('workspace.add', params)
}

export function updateWorkspace(params: { workspaceId: string; name: string }) {
    return wsRequest<{ updated: boolean; item: WorkspaceRecord }>('workspace.update', params)
}

export function removeWorkspace(params: { workspaceId: string }) {
    return wsRequest<{ deleted: boolean; deletedSessions?: number }>('workspace.remove', params)
}

export function listWorkspaceDirectories(path?: string) {
    return wsRequest<WorkspaceFsListResult>('workspace.fs.list', path ? { path } : {})
}
