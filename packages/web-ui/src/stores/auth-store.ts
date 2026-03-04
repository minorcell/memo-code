import { create } from 'zustand'
import { authApi, clearAuthTokens, getAuthTokens, setAuthTokens } from '@/api'
import { getErrorMessage } from '@/utils/error'

type AuthStore = {
    isAuthenticated: boolean
    username: string
    pending: boolean
    error: string | null
    login: (password: string) => Promise<boolean>
    logout: () => Promise<void>
    clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
    isAuthenticated: Boolean(getAuthTokens()?.accessToken),
    username: 'memo',
    pending: false,
    error: null,
    async login(password) {
        set({ pending: true, error: null })
        try {
            const pair = await authApi.login({ password })
            setAuthTokens({
                accessToken: pair.accessToken,
                accessTokenExpiresAt: Date.now() + pair.expiresIn * 1000,
            })
            set({ isAuthenticated: true, username: 'memo', pending: false })
            return true
        } catch (error) {
            set({ pending: false, error: getErrorMessage(error, 'Login failed') })
            return false
        }
    },
    async logout() {
        set({ pending: true, error: null })
        try {
            await authApi.logout()
        } catch {
            // Ignore logout API failure and clear local state anyway.
        } finally {
            clearAuthTokens()
            set({ isAuthenticated: false, pending: false })
        }
    },
    clearError() {
        set({ error: null })
    },
}))
