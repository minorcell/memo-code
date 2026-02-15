import assert from 'node:assert'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { McpToolRegistry } from './mcp'
import { ToolRouter, createToolRouter, type MCPServerConfig } from './index'

function serverConfig(): Record<string, MCPServerConfig> {
    return {
        remote: {
            type: 'streamable_http',
            url: 'https://example.com/mcp',
        },
    }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('tool router mcp oauth wiring', () => {
    test('loadMcpServers forwards oauth settings to mcp registry', async () => {
        const loadSpy = vi
            .spyOn(McpToolRegistry.prototype, 'loadServersWithOptions')
            .mockResolvedValue(1)
        const router = new ToolRouter()
        const settings = { memoHome: '/tmp/memo', storeMode: 'file' as const, callbackPort: 4567 }

        const loaded = await router.loadMcpServers(serverConfig(), settings)

        assert.strictEqual(loaded, 1)
        expect(loadSpy).toHaveBeenCalledWith(serverConfig(), settings)
    })

    test('createToolRouter passes mcpOAuthSettings when loading servers', async () => {
        const loadSpy = vi
            .spyOn(McpToolRegistry.prototype, 'loadServersWithOptions')
            .mockResolvedValue(1)
        const settings = {
            memoHome: '/tmp/memo-home',
            storeMode: 'auto' as const,
            callbackPort: 33333,
        }

        await createToolRouter({
            mcpServers: serverConfig(),
            mcpOAuthSettings: settings,
        })

        expect(loadSpy).toHaveBeenCalledWith(serverConfig(), settings)
    })

    test('createToolRouter skips load when no mcp servers are configured', async () => {
        const loadSpy = vi
            .spyOn(McpToolRegistry.prototype, 'loadServersWithOptions')
            .mockResolvedValue(0)

        await createToolRouter({})

        expect(loadSpy).not.toHaveBeenCalled()
    })
})
