import { create } from 'zustand'
import { authApi, clearAuthTokens, disconnectWs, getAuthTokens, setAuthTokens } from '@/api'
import { getErrorMessage } from '@/utils/error'

type AuthStore = {
    isAuthenticated: boolean
    username: string
    pending: boolean
    error: string | null
    login: (username: string, password: string) => Promise<boolean>
    logout: () => Promise<void>
    clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
    isAuthenticated: Boolean(getAuthTokens()?.accessToken),
    username: 'memo',
    pending: false,
    error: null,
    async login(username, password) {
        set({ pending: true, error: null })
        try {
            const pair = await authApi.login({ username, password })
            setAuthTokens({
                accessToken: pair.accessToken,
                refreshToken: pair.refreshToken,
                accessTokenExpiresAt: Date.now() + pair.accessTokenExpiresIn * 1000,
                refreshTokenExpiresAt: Date.now() + pair.refreshTokenExpiresIn * 1000,
            })
            set({ isAuthenticated: true, username, pending: false })
            return true
        } catch (error) {
            set({ pending: false, error: getErrorMessage(error, 'Login failed') })
            return false
        }
    },
    async logout() {
        const current = getAuthTokens()
        set({ pending: true, error: null })
        try {
            if (current?.refreshToken) {
                await authApi.logout({ refreshToken: current.refreshToken })
            }
        } catch {
            // Ignore logout API failure and clear local state anyway.
        } finally {
            disconnectWs()
            clearAuthTokens()
            set({ isAuthenticated: false, pending: false })
        }
    },
    clearError() {
        set({ error: null })
    },
}))
