import axios, {
    AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type InternalAxiosRequestConfig,
} from 'axios'
import type { ApiEnvelope, AuthTokenPair, TokenState } from '@/api/types'

export const DEFAULT_TIMEOUT = 20_000
const TOKEN_STORAGE_KEY = 'memo_web_tokens'
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000

type RetryConfig = InternalAxiosRequestConfig & {
    __retried?: boolean
}

let tokenState: TokenState | null = null
let refreshingPromise: Promise<TokenState | null> | null = null

const baseURL = (import.meta.env?.VITE_SERVER_BASE_URL as string | undefined) ?? undefined

const httpClient: AxiosInstance = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT,
})

const refreshClient: AxiosInstance = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT,
})

function unwrapEnvelope<T>(payload: unknown): T {
    const maybeEnvelope = payload as ApiEnvelope<T>
    if (maybeEnvelope && typeof maybeEnvelope === 'object' && 'success' in maybeEnvelope) {
        if (maybeEnvelope.success) {
            return maybeEnvelope.data
        }
        throw new Error(maybeEnvelope.error.message || 'Request failed')
    }
    return payload as T
}

function parseApiError(error: AxiosError): Error {
    const payload = error.response?.data as
        | ApiEnvelope<unknown>
        | { message?: unknown; error?: { message?: unknown } }
        | undefined

    const message =
        (payload && typeof payload === 'object' && 'success' in payload && !payload.success
            ? payload.error.message
            : undefined) ||
        (payload && typeof payload === 'object' && 'error' in payload
            ? (payload.error as { message?: unknown } | undefined)?.message
            : undefined) ||
        (payload && typeof payload === 'object' && 'message' in payload
            ? payload.message
            : undefined) ||
        error.message ||
        'Request failed'

    if (typeof message === 'string' && message.trim().length > 0) {
        return new Error(message)
    }
    return new Error('Request failed')
}

function normalizeTokens(value: Partial<AuthTokenPair> | Partial<TokenState>): TokenState | null {
    if (typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string') {
        return null
    }

    const accessToken = value.accessToken.trim()
    const refreshToken = value.refreshToken.trim()

    if (!accessToken || !refreshToken) return null

    const input = value as Partial<AuthTokenPair> & Partial<TokenState>
    const now = Date.now()

    const accessTokenExpiresAt =
        typeof input.accessTokenExpiresAt === 'number' &&
        Number.isFinite(input.accessTokenExpiresAt)
            ? input.accessTokenExpiresAt
            : typeof input.accessTokenExpiresIn === 'number' &&
                Number.isFinite(input.accessTokenExpiresIn) &&
                input.accessTokenExpiresIn > 0
              ? now + Math.floor(input.accessTokenExpiresIn * 1000)
              : parseJwtExpiresAt(accessToken)

    const refreshTokenExpiresAt =
        typeof input.refreshTokenExpiresAt === 'number' &&
        Number.isFinite(input.refreshTokenExpiresAt)
            ? input.refreshTokenExpiresAt
            : typeof input.refreshTokenExpiresIn === 'number' &&
                Number.isFinite(input.refreshTokenExpiresIn) &&
                input.refreshTokenExpiresIn > 0
              ? now + Math.floor(input.refreshTokenExpiresIn * 1000)
              : parseJwtExpiresAt(refreshToken)

    return {
        accessToken,
        refreshToken,
        ...(typeof accessTokenExpiresAt === 'number' ? { accessTokenExpiresAt } : {}),
        ...(typeof refreshTokenExpiresAt === 'number' ? { refreshTokenExpiresAt } : {}),
    }
}

function parseJwtExpiresAt(token: string): number | undefined {
    const parts = token.split('.')
    if (parts.length < 2) return undefined

    try {
        const payload = JSON.parse(base64UrlDecode(parts[1])) as { exp?: unknown }
        if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
            return undefined
        }
        return Math.floor(payload.exp * 1000)
    } catch {
        return undefined
    }
}

function base64UrlDecode(raw: string): string {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
    const paddingLength = (4 - (normalized.length % 4)) % 4
    const padded = normalized.padEnd(normalized.length + paddingLength, '=')
    return atob(padded)
}

function isAccessTokenNearExpiry(
    tokens: TokenState | null,
    bufferMs = ACCESS_TOKEN_REFRESH_BUFFER_MS,
) {
    if (!tokens?.accessToken) return false
    const expiresAt = tokens.accessTokenExpiresAt ?? parseJwtExpiresAt(tokens.accessToken)
    if (typeof expiresAt !== 'number') return false
    return Date.now() + bufferMs >= expiresAt
}

export function getAuthTokens(): TokenState | null {
    if (tokenState) return tokenState
    try {
        const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<TokenState>
        const normalized = normalizeTokens(parsed)
        tokenState = normalized
        return normalized
    } catch {
        return null
    }
}

export function setAuthTokens(next: TokenState | null): void {
    tokenState = next
    if (!next) {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        return
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next))
}

export function clearAuthTokens(): void {
    setAuthTokens(null)
}

async function refreshTokens(): Promise<TokenState | null> {
    if (refreshingPromise) return refreshingPromise

    const current = getAuthTokens()
    if (!current?.refreshToken) return null

    refreshingPromise = (async () => {
        try {
            const response = await refreshClient.post<ApiEnvelope<AuthTokenPair>>(
                '/api/auth/refresh',
                {
                    refreshToken: current.refreshToken,
                },
            )
            const payload = unwrapEnvelope<AuthTokenPair>(response.data)
            const tokens = normalizeTokens(payload)
            if (!tokens) {
                clearAuthTokens()
                return null
            }
            setAuthTokens(tokens)
            return tokens
        } catch {
            clearAuthTokens()
            return null
        } finally {
            refreshingPromise = null
        }
    })()

    return refreshingPromise
}

export async function refreshAuthTokens(): Promise<TokenState | null> {
    return refreshTokens()
}

export async function ensureValidAccessToken(): Promise<TokenState | null> {
    const current = getAuthTokens()
    if (!current?.accessToken) return null

    if (isAccessTokenNearExpiry(current)) {
        const refreshed = await refreshTokens()
        if (refreshed) return refreshed
    }

    return getAuthTokens()
}

httpClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const isRefreshRequest =
        typeof config.url === 'string' && config.url.includes('/api/auth/refresh')
    const tokens = isRefreshRequest ? getAuthTokens() : await ensureValidAccessToken()
    if (tokens?.accessToken) {
        config.headers = config.headers ?? {}
        config.headers.Authorization = `Bearer ${tokens.accessToken}`
    }
    return config
})

httpClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status
        const config = error.config as RetryConfig | undefined
        const isRefreshRequest = config?.url?.includes('/api/auth/refresh')

        if (status === 401 && config && !config.__retried && !isRefreshRequest) {
            config.__retried = true
            const refreshed = await refreshTokens()
            if (refreshed?.accessToken) {
                config.headers = config.headers ?? {}
                config.headers.Authorization = `Bearer ${refreshed.accessToken}`
                return httpClient.request(config)
            }
        }

        return Promise.reject(parseApiError(error))
    },
)

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
    const response = await httpClient.request(config)
    return unwrapEnvelope<T>(response.data)
}
