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

const baseURL = (import.meta.env?.VITE_SERVER_BASE_URL as string | undefined) ?? undefined

const httpClient: AxiosInstance = axios.create({
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

function normalizeTokens(value: Partial<AuthTokenPair> | Partial<TokenState>): TokenState | null {
    if (typeof value.accessToken !== 'string') {
        return null
    }

    const accessToken = value.accessToken.trim()
    if (!accessToken) return null

    const expiresIn =
        typeof (value as Partial<AuthTokenPair>).expiresIn === 'number' &&
        Number.isFinite((value as Partial<AuthTokenPair>).expiresIn)
            ? Math.max(0, Math.floor((value as Partial<AuthTokenPair>).expiresIn as number))
            : undefined

    const accessTokenExpiresAt =
        'accessTokenExpiresAt' in value &&
        typeof value.accessTokenExpiresAt === 'number' &&
        Number.isFinite(value.accessTokenExpiresAt)
            ? value.accessTokenExpiresAt
            : typeof expiresIn === 'number'
              ? Date.now() + expiresIn * 1000
              : parseJwtExpiresAt(accessToken)

    return {
        accessToken,
        ...(typeof accessTokenExpiresAt === 'number' ? { accessTokenExpiresAt } : {}),
    }
}

function isAccessTokenNearExpiry(tokens: TokenState | null): boolean {
    if (!tokens?.accessToken) return false
    const expiresAt = tokens.accessTokenExpiresAt ?? parseJwtExpiresAt(tokens.accessToken)
    if (typeof expiresAt !== 'number') return false
    return Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS >= expiresAt
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

export async function refreshAuthTokens(): Promise<TokenState | null> {
    // Core HTTP server does not provide refresh tokens.
    return null
}

export async function ensureValidAccessToken(): Promise<TokenState | null> {
    const current = getAuthTokens()
    if (!current?.accessToken) return null

    if (isAccessTokenNearExpiry(current)) {
        // Without refresh tokens we can only rely on re-login once the token expires.
        const expiresAt = current.accessTokenExpiresAt ?? parseJwtExpiresAt(current.accessToken)
        if (typeof expiresAt === 'number' && Date.now() >= expiresAt) {
            clearAuthTokens()
            return null
        }
    }

    return current
}

httpClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const tokens = await ensureValidAccessToken()
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

        if (status === 401 && config && !config.__retried) {
            config.__retried = true
            clearAuthTokens()
        }

        return Promise.reject(parseApiError(error))
    },
)

export async function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
    const response = await httpClient.request(config)
    return unwrapEnvelope<T>(response.data)
}
