import { describe, expect, test } from 'vitest'
import { getErrorMessage, parseEnvAssignment } from './mcp_helpers'

describe('mcp helpers', () => {
    test('parseEnvAssignment parses valid assignment', () => {
        const result = parseEnvAssignment('KEY=value')
        expect(result).toEqual({ key: 'KEY', value: 'value' })
    })

    test('parseEnvAssignment parses assignment with equals in value', () => {
        const result = parseEnvAssignment('KEY=a=b=c')
        expect(result).toEqual({ key: 'KEY', value: 'a=b=c' })
    })

    test('parseEnvAssignment returns null for invalid input', () => {
        expect(parseEnvAssignment('=value')).toBeNull()
        expect(parseEnvAssignment('')).toBeNull()
        expect(parseEnvAssignment('KEY')).toBeNull()
    })

    test('getErrorMessage extracts message from Error', () => {
        expect(getErrorMessage(new Error('test error'))).toBe('test error')
    })

    test('getErrorMessage converts non-Error to string', () => {
        expect(getErrorMessage(123)).toBe('123')
        expect(getErrorMessage('string error')).toBe('string error')
        expect(getErrorMessage({ message: 'obj' })).toBe('[object Object]')
    })
})
