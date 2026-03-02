import { describe, expect, test, vi } from 'vitest'
import { CoreAuth, CoreAuthError } from '@memo/core/server/handler/auth'

describe('CoreAuth', () => {
    test('issues and verifies access token', () => {
        const auth = new CoreAuth({ password: 'secret' })
        const login = auth.login('secret')

        expect(typeof login.accessToken).toBe('string')
        expect(login.expiresIn).toBeGreaterThan(0)

        const payload = auth.verify(login.accessToken)
        expect(payload.sub).toBe('memo-user')
        expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    test('throws on invalid password', () => {
        const auth = new CoreAuth({ password: 'secret' })
        expect(() => auth.login('bad-password')).toThrow(CoreAuthError)
    })

    test('throws when token expired', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

        const auth = new CoreAuth({ password: 'secret', tokenTtlSeconds: 1 })
        const login = auth.login('secret')

        vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
        expect(() => auth.verify(login.accessToken)).toThrow(CoreAuthError)

        vi.useRealTimers()
    })
})
