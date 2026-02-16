import { create } from 'zustand'
import { skillsApi } from '@/api'
import type { SkillRecord } from '@/api/types'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { getErrorMessage } from '@/utils/error'

type SkillsStore = {
    items: SkillRecord[]
    loading: boolean
    error: string | null
    load: (query?: {
        scope?: 'project' | 'global'
        q?: string
        workspaceId?: string
    }) => Promise<void>
    create: (payload: {
        scope: 'project' | 'global'
        workspaceId?: string
        name: string
        description?: string
        content?: string
    }) => Promise<void>
    remove: (id: string) => Promise<void>
    toggleActive: (id: string, active: boolean) => Promise<boolean>
    clearError: () => void
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
    items: [],
    loading: false,
    error: null,

    async load(query) {
        set({ loading: true, error: null })
        try {
            const selectedWorkspaceId = useWorkspaceStore.getState().selectedWorkspaceId
            const response = await skillsApi.getSkills({
                ...query,
                workspaceId: query?.workspaceId ?? selectedWorkspaceId ?? undefined,
            })
            set({ items: response.items, loading: false })
        } catch (error) {
            set({
                loading: false,
                error: getErrorMessage(error, 'Failed to load skills'),
            })
        }
    },

    async create(payload) {
        const name = payload.name.trim()
        if (!name) return

        set({ error: null })
        try {
            await skillsApi.createSkill({
                ...payload,
                workspaceId:
                    payload.workspaceId ??
                    useWorkspaceStore.getState().selectedWorkspaceId ??
                    undefined,
                name,
            })
            await get().load()
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to create skill') })
        }
    },

    async remove(id) {
        set({ error: null })
        try {
            await skillsApi.removeSkill(id)
            await get().load()
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to delete skill') })
        }
    },

    async toggleActive(id, active) {
        const current = get()
        const ids = active
            ? Array.from(
                  new Set([
                      ...current.items.filter((item) => item.active).map((item) => item.id),
                      id,
                  ]),
              )
            : current.items.filter((item) => item.active && item.id !== id).map((item) => item.id)

        set({ error: null })
        try {
            await skillsApi.setActiveSkillIds(ids)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to update active skills') })
            return false
        }
    },

    clearError() {
        set({ error: null })
    },
}))
