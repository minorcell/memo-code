import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthLoginResponse } from '@memo/core/web/types'

type TokenPayload = {
    sub: string
    iat: number
    exp: number
}

export type CoreAuthOptions = {
    password: string
    tokenTtlSeconds?: number
    subject?: string
}

export class CoreAuthError extends Error {
    constructor(
        readonly code: 'INVALID_CREDENTIALS' | 'TOKEN_INVALID' | 'TOKEN_EXPIRED',
        message: string,
    ) {
        super(message)
    }
}

function toBase64Url(input: string | Buffer): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
}

function fromBase64Url(input: string): Buffer {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`
    return Buffer.from(padded, 'base64')
}

function safeEqual(left: Buffer, right: Buffer): boolean {
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
}

function hashSecret(secret: string): Buffer {
    return createHash('sha256').update(secret, 'utf8').digest()
}

export class CoreAuth {
    private readonly passwordHash: Buffer
    private readonly signingKey: Buffer
    private readonly tokenTtlSeconds: number
    private readonly subject: string

    constructor(options: CoreAuthOptions) {
        const password = options.password
        if (!password) {
            throw new Error('MEMO_SERVER_PASSWORD is required')
        }
        this.passwordHash = hashSecret(password)
        this.signingKey = hashSecret(`memo-core-auth:${password}`)
        this.tokenTtlSeconds =
            typeof options.tokenTtlSeconds === 'number' &&
            Number.isFinite(options.tokenTtlSeconds) &&
            options.tokenTtlSeconds > 0
                ? Math.floor(options.tokenTtlSeconds)
                : 8 * 60 * 60
        this.subject = options.subject?.trim() || 'memo-user'
    }

    login(inputPassword: string): AuthLoginResponse {
        const incoming = hashSecret(inputPassword)
        if (!safeEqual(incoming, this.passwordHash)) {
            throw new CoreAuthError('INVALID_CREDENTIALS', 'Invalid password')
        }

        const iat = Math.floor(Date.now() / 1000)
        const payload: TokenPayload = {
            sub: this.subject,
            iat,
            exp: iat + this.tokenTtlSeconds,
        }

        const payloadPart = toBase64Url(JSON.stringify(payload))
        const signaturePart = this.sign(payloadPart)

        return {
            accessToken: `${payloadPart}.${signaturePart}`,
            expiresIn: this.tokenTtlSeconds,
        }
    }

    verify(token: string): TokenPayload {
        const [payloadPart, signaturePart] = token.split('.')
        if (!payloadPart || !signaturePart) {
            throw new CoreAuthError('TOKEN_INVALID', 'Invalid access token')
        }

        const expectedSignature = this.sign(payloadPart)
        if (!safeEqual(Buffer.from(signaturePart), Buffer.from(expectedSignature))) {
            throw new CoreAuthError('TOKEN_INVALID', 'Invalid access token')
        }

        let payload: TokenPayload
        try {
            payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as TokenPayload
        } catch {
            throw new CoreAuthError('TOKEN_INVALID', 'Invalid access token')
        }

        const now = Math.floor(Date.now() / 1000)
        if (!payload.exp || payload.exp <= now) {
            throw new CoreAuthError('TOKEN_EXPIRED', 'Access token expired')
        }

        return payload
    }

    private sign(payloadPart: string): string {
        return toBase64Url(createHmac('sha256', this.signingKey).update(payloadPart).digest())
    }
}
