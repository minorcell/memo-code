import { request } from '@/api/request'
import type { AuthTokenPair } from '@/api/types'

export function login(params: { username: string; password: string }) {
    return request<AuthTokenPair>({
        method: 'POST',
        url: '/api/auth/login',
        data: params,
    })
}

export function refreshToken(params: { refreshToken: string }) {
    return request<AuthTokenPair>({
        method: 'POST',
        url: '/api/auth/refresh',
        data: params,
    })
}

export function logout(params: { refreshToken: string }) {
    return request<{ loggedOut: boolean }>({
        method: 'POST',
        url: '/api/auth/logout',
        data: params,
    })
}
