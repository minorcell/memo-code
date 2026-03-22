import { constants } from 'node:fs'
import { access, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { CoreSessionManager } from '@memo/core/server/handler/session_manager'
import {
    defaultWorkspaceName,
    normalizeWorkspacePath,
    workspaceIdFromCwd,
} from '@memo/core/runtime/workspace'
import type {
    WorkspaceDirEntry,
    WorkspaceFsListResult,
    WorkspaceRecord,
} from '@memo/core/web/types'
import { HttpApiError } from '@memo/core/server/utils/http'

const MAX_DIRECTORY_ITEMS = 200

export type WorkspaceState = {
    overrides: Map<string, WorkspaceRecord>
    removedIds: Set<string>
}

export function createWorkspaceState(): WorkspaceState {
    return {
        overrides: new Map(),
        removedIds: new Set(),
    }
}

export function buildWorkspaceRecord(cwd: string, name?: string): WorkspaceRecord {
    const normalized = normalizeWorkspacePath(cwd)
    const now = new Date().toISOString()
    return {
        id: workspaceIdFromCwd(normalized),
        name: name?.trim() || defaultWorkspaceName(normalized),
        cwd: normalized,
        createdAt: now,
        lastUsedAt: now,
    }
}

export async function listWorkspaces(
    sessionManager: CoreSessionManager,
    state: WorkspaceState,
): Promise<{ items: WorkspaceRecord[] }> {
    const listing = await sessionManager.listSessions({
        page: 1,
        pageSize: 1000,
        sortBy: 'updatedAt',
        order: 'desc',
    })

    const byId = new Map<string, WorkspaceRecord>()
    for (const item of listing.items) {
        const recordId = workspaceIdFromCwd(item.cwd)
        const existing = byId.get(recordId)
        if (!existing) {
            byId.set(recordId, {
                id: recordId,
                name: item.project || defaultWorkspaceName(item.cwd),
                cwd: normalizeWorkspacePath(item.cwd),
                createdAt: item.date.startedAt,
                lastUsedAt: item.date.updatedAt,
            })
            continue
        }

        if (item.date.startedAt < existing.createdAt) {
            existing.createdAt = item.date.startedAt
        }
        if (item.date.updatedAt > existing.lastUsedAt) {
            existing.lastUsedAt = item.date.updatedAt
        }
    }

    for (const [id, override] of state.overrides.entries()) {
        byId.set(id, override)
    }
    for (const removedId of state.removedIds) {
        byId.delete(removedId)
    }

    const items = Array.from(byId.values()).sort((left, right) =>
        right.lastUsedAt.localeCompare(left.lastUsedAt),
    )
    return { items }
}

export async function listWorkspaceDirectories(
    pathInput: string | null,
): Promise<WorkspaceFsListResult> {
    const rootPath = await resolveReadableDirectory('/')
    let requestedPath = pathInput?.trim() ? pathInput.trim() : rootPath

    if (!pathInput?.trim() && rootPath === '/') {
        try {
            requestedPath = await resolveReadableDirectory(homedir())
        } catch {
            requestedPath = rootPath
        }
    }

    const targetPath = await resolveReadableDirectory(requestedPath)

    if (!isWithinRoot(targetPath, rootPath)) {
        throw new HttpApiError(400, 'BAD_REQUEST', 'path is outside workspace browser root')
    }

    let entries: import('node:fs').Dirent[]
    try {
        entries = await readdir(targetPath, { withFileTypes: true })
    } catch {
        throw new HttpApiError(400, 'BAD_REQUEST', 'failed to read directory')
    }

    const items: WorkspaceDirEntry[] = []
    const sorted = entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of sorted) {
        if (entry.name.startsWith('.')) continue
        if (items.length >= MAX_DIRECTORY_ITEMS) break

        const full = resolve(targetPath, entry.name)
        if (entry.isDirectory()) {
            const normalized = normalizeWorkspacePath(full)
            if (!isWithinRoot(normalized, rootPath)) continue
            let readable = true
            try {
                await access(normalized, constants.R_OK | constants.X_OK)
            } catch {
                readable = false
            }
            items.push({
                name: entry.name,
                path: normalized,
                kind: 'dir',
                readable,
            })
            continue
        }

        if (entry.isSymbolicLink()) {
            try {
                const linkedPath = normalizeWorkspacePath(await realpath(full))
                const linkedStat = await stat(linkedPath)
                if (!linkedStat.isDirectory()) continue
                if (!isWithinRoot(linkedPath, rootPath)) continue
                let readable = true
                try {
                    await access(linkedPath, constants.R_OK | constants.X_OK)
                } catch {
                    readable = false
                }
                items.push({
                    name: entry.name,
                    path: linkedPath,
                    kind: 'dir',
                    readable,
                })
            } catch {
                // Ignore unreadable symlink entries.
            }
        }
    }

    const parent = dirname(targetPath)
    const parentPath =
        targetPath === rootPath || !isWithinRoot(parent, rootPath)
            ? null
            : normalizeWorkspacePath(parent)

    return {
        path: normalizeWorkspacePath(targetPath),
        parentPath,
        items,
    }
}

function isWithinRoot(path: string, rootPath: string): boolean {
    const normalizedPath = normalizeWorkspacePath(path)
    const normalizedRoot = normalizeWorkspacePath(rootPath)
    if (normalizedRoot === '/') return true
    if (normalizedPath === normalizedRoot) return true
    return normalizedPath.startsWith(`${normalizedRoot}/`)
}

async function resolveReadableDirectory(path: string): Promise<string> {
    const normalizedPath = normalizeWorkspacePath(path)
    let realPathValue: string
    try {
        realPathValue = normalizeWorkspacePath(await realpath(normalizedPath))
    } catch {
        throw new HttpApiError(400, 'BAD_REQUEST', `directory does not exist: ${path}`)
    }

    let directoryStat: import('node:fs').Stats
    try {
        directoryStat = await stat(realPathValue)
    } catch {
        throw new HttpApiError(400, 'BAD_REQUEST', `directory is not accessible: ${path}`)
    }

    if (!directoryStat.isDirectory()) {
        throw new HttpApiError(400, 'BAD_REQUEST', `path is not a directory: ${path}`)
    }

    try {
        await access(realPathValue, constants.R_OK | constants.X_OK)
    } catch {
        throw new HttpApiError(400, 'BAD_REQUEST', `directory is not readable: ${path}`)
    }

    return realPathValue
}
