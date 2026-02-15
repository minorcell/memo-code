import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspacesApi } from '@/api'
import type { WorkspaceDirEntry, WorkspaceRecord } from '@/api/types'
import { getErrorMessage } from '@/utils/error'

const STORAGE_KEY = 'memo_web_workspace'

type WorkspaceStore = {
    items: WorkspaceRecord[]
    selectedWorkspaceId: string | null
    homePath: string | null
    browserPath: string
    browserParentPath: string | null
    browserItems: WorkspaceDirEntry[]
    loading: boolean
    browsing: boolean
    error: string | null
    clearError: () => void
    setSelectedWorkspaceId: (workspaceId: string | null) => void
    loadWorkspaces: () => Promise<WorkspaceRecord[]>
    addWorkspace: (input: { cwd: string; name?: string }) => Promise<WorkspaceRecord | null>
    renameWorkspace: (workspaceId: string, name: string) => Promise<void>
    removeWorkspace: (workspaceId: string) => Promise<void>
    loadDirectories: (path?: string) => Promise<void>
}

function byName(a: WorkspaceRecord, b: WorkspaceRecord): number {
    const nameResult = a.name.localeCompare(b.name, undefined, {
        sensitivity: 'base',
    })
    if (nameResult !== 0) return nameResult
    return a.cwd.localeCompare(b.cwd)
}

function normalizeSelectedWorkspaceId(
    selectedWorkspaceId: string | null,
    items: WorkspaceRecord[],
): string | null {
    if (!selectedWorkspaceId) {
        return items[0]?.id ?? null
    }
    const exists = items.some((item) => item.id === selectedWorkspaceId)
    if (exists) return selectedWorkspaceId
    return items[0]?.id ?? null
}

export const useWorkspaceStore = create<WorkspaceStore>()(
    persist(
        (set, get) => ({
            items: [],
            selectedWorkspaceId: null,
            homePath: null,
            browserPath: '/',
            browserParentPath: null,
            browserItems: [],
            loading: false,
            browsing: false,
            error: null,

            clearError() {
                set({ error: null })
            },

            setSelectedWorkspaceId(workspaceId) {
                set({ selectedWorkspaceId: workspaceId?.trim() || null })
            },

            async loadWorkspaces() {
                set({ loading: true, error: null })
                try {
                    const response = await workspacesApi.listWorkspaces()
                    const items = [...response.items].sort(byName)
                    set((state) => ({
                        items,
                        loading: false,
                        selectedWorkspaceId: normalizeSelectedWorkspaceId(
                            state.selectedWorkspaceId,
                            items,
                        ),
                    }))
                    return items
                } catch (error) {
                    set({
                        loading: false,
                        error: getErrorMessage(error, 'Failed to load workspaces'),
                    })
                    return []
                }
            },

            async addWorkspace(input) {
                const cwd = input.cwd.trim()
                if (!cwd) return null

                set({ loading: true, error: null })
                try {
                    const response = await workspacesApi.addWorkspace({
                        cwd,
                        name: input.name?.trim() || undefined,
                    })
                    const nextItem = response.item
                    const nextItems = [
                        ...get().items.filter((item) => item.id !== nextItem.id),
                        nextItem,
                    ].sort(byName)

                    set({
                        items: nextItems,
                        selectedWorkspaceId: nextItem.id,
                        loading: false,
                    })

                    return nextItem
                } catch (error) {
                    set({
                        loading: false,
                        error: getErrorMessage(error, 'Failed to add workspace'),
                    })
                    return null
                }
            },

            async renameWorkspace(workspaceId, name) {
                const normalizedId = workspaceId.trim()
                const normalizedName = name.trim()
                if (!normalizedId || !normalizedName) return

                set({ loading: true, error: null })
                try {
                    const response = await workspacesApi.updateWorkspace({
                        workspaceId: normalizedId,
                        name: normalizedName,
                    })

                    set((state) => ({
                        loading: false,
                        items: state.items
                            .map((item) => (item.id === normalizedId ? response.item : item))
                            .sort(byName),
                    }))
                } catch (error) {
                    set({
                        loading: false,
                        error: getErrorMessage(error, 'Failed to rename workspace'),
                    })
                }
            },

            async removeWorkspace(workspaceId) {
                const normalizedId = workspaceId.trim()
                if (!normalizedId) return

                set({ loading: true, error: null })
                try {
                    await workspacesApi.removeWorkspace({ workspaceId: normalizedId })
                    set((state) => {
                        const items = state.items.filter((item) => item.id !== normalizedId)
                        return {
                            loading: false,
                            items,
                            selectedWorkspaceId: normalizeSelectedWorkspaceId(
                                state.selectedWorkspaceId === normalizedId
                                    ? null
                                    : state.selectedWorkspaceId,
                                items,
                            ),
                        }
                    })
                } catch (error) {
                    set({
                        loading: false,
                        error: getErrorMessage(error, 'Failed to remove workspace'),
                    })
                }
            },

            async loadDirectories(path) {
                set({ browsing: true, error: null })
                try {
                    const response = await workspacesApi.listWorkspaceDirectories(path)
                    set({
                        browsing: false,
                        homePath: get().homePath ?? response.path,
                        browserPath: response.path,
                        browserParentPath: response.parentPath,
                        browserItems: response.items,
                    })
                } catch (error) {
                    set({
                        browsing: false,
                        error: getErrorMessage(error, 'Failed to browse directories'),
                    })
                }
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state) => ({
                selectedWorkspaceId: state.selectedWorkspaceId,
            }),
            merge: (persistedState, currentState) => {
                const persisted =
                    persistedState && typeof persistedState === 'object'
                        ? (persistedState as Partial<WorkspaceStore>)
                        : {}
                return {
                    ...currentState,
                    selectedWorkspaceId:
                        typeof persisted.selectedWorkspaceId === 'string'
                            ? persisted.selectedWorkspaceId
                            : null,
                }
            },
        },
    ),
)
