import { request } from '@/api/request'
import type { AuthTokenPair } from '@/api/types'

export function login(params: { password: string }) {
    return request<AuthTokenPair>({
        method: 'POST',
        url: '/api/auth/login',
        data: {
            password: params.password,
        },
    })
}

export async function refreshToken(): Promise<AuthTokenPair> {
    throw new Error('Token refresh is not supported by core HTTP server')
}

export async function logout(): Promise<{ loggedOut: boolean }> {
    return { loggedOut: true }
}
