import { create } from 'zustand'
import { mcpApi } from '@/api'
import type { McpServerConfig, McpServerRecord } from '@/api/types'
import { getErrorMessage } from '@/utils/error'

type McpStore = {
    items: McpServerRecord[]
    loading: boolean
    error: string | null
    load: () => Promise<void>
    createServer: (name: string, config: McpServerConfig) => Promise<boolean>
    updateServer: (name: string, config: McpServerConfig) => Promise<boolean>
    removeServer: (name: string) => Promise<boolean>
    loginServer: (name: string) => Promise<boolean>
    logoutServer: (name: string) => Promise<boolean>
    toggleActive: (name: string, active: boolean) => Promise<boolean>
    clearError: () => void
}

export const useMcpStore = create<McpStore>((set, get) => ({
    items: [],
    loading: false,
    error: null,

    async load() {
        set({ loading: true, error: null })
        try {
            const response = await mcpApi.getMcpServers()
            set({ items: response.items, loading: false })
        } catch (error) {
            set({
                loading: false,
                error: getErrorMessage(error, 'Failed to load MCP servers'),
            })
        }
    },

    async createServer(name, config) {
        const trimmedName = name.trim()
        if (!trimmedName) return false

        set({ error: null })
        try {
            await mcpApi.createMcpServer(trimmedName, config)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to create MCP server') })
            return false
        }
    },

    async updateServer(name, config) {
        const trimmedName = name.trim()
        if (!trimmedName) return false

        set({ error: null })
        try {
            await mcpApi.updateMcpServer(trimmedName, config)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to update MCP server') })
            return false
        }
    },

    async removeServer(name) {
        set({ error: null })
        try {
            await mcpApi.removeMcpServer(name)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to remove MCP server') })
            return false
        }
    },

    async loginServer(name) {
        set({ error: null })
        try {
            await mcpApi.loginMcpServer(name)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to login MCP server') })
            return false
        }
    },

    async logoutServer(name) {
        set({ error: null })
        try {
            await mcpApi.logoutMcpServer(name)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to logout MCP server') })
            return false
        }
    },

    async toggleActive(name, active) {
        const current = get()
        const names = active
            ? Array.from(
                  new Set([
                      ...current.items.filter((item) => item.active).map((item) => item.name),
                      name,
                  ]),
              )
            : current.items
                  .filter((item) => item.active && item.name !== name)
                  .map((item) => item.name)

        set({ error: null })
        try {
            await mcpApi.setActiveMcpServers(names)
            await get().load()
            return true
        } catch (error) {
            set({ error: getErrorMessage(error, 'Failed to update active MCP servers') })
            return false
        }
    },

    clearError() {
        set({ error: null })
    },
}))
