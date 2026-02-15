import { describe, expect, test, vi } from 'vitest'
import { loadMemoConfig, writeMemoConfig } from '@memo/core'
import * as mcpModule from './mcp'

vi.mock('@memo/core', () => ({
    loadMemoConfig: vi.fn(),
    writeMemoConfig: vi.fn(),
}))

vi.mock('@memo/tools/router/mcp/oauth', () => ({
    getMcpAuthStatus: vi.fn(),
    loginMcpServerOAuth: vi.fn(),
    logoutMcpServerOAuth: vi.fn(),
}))

describe('mcp CLI helpers', () => {
    test('parseEnvAssignment parses valid assignment', () => {
        const result = mcpModule.parseEnvAssignment('KEY=value')
        expect(result).toEqual({ key: 'KEY', value: 'value' })
    })

    test('parseEnvAssignment parses assignment with equals in value', () => {
        const result = mcpModule.parseEnvAssignment('KEY=a=b=c')
        expect(result).toEqual({ key: 'KEY', value: 'a=b=c' })
    })

    test('parseEnvAssignment returns null for invalid input', () => {
        expect(mcpModule.parseEnvAssignment('=value')).toBeNull()
        expect(mcpModule.parseEnvAssignment('')).toBeNull()
        expect(mcpModule.parseEnvAssignment('KEY')).toBeNull()
    })

    test('getErrorMessage extracts message from Error', () => {
        expect(mcpModule.getErrorMessage(new Error('test error'))).toBe('test error')
    })

    test('getErrorMessage converts non-Error to string', () => {
        expect(mcpModule.getErrorMessage(123)).toBe('123')
        expect(mcpModule.getErrorMessage('string error')).toBe('string error')
        expect(mcpModule.getErrorMessage({ message: 'obj' })).toBe('[object Object]')
    })
})
