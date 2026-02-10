import assert from 'node:assert'
import { describe, test } from 'vitest'
import { resolveSlashCommand, buildHelpText } from './registry'

const context = {
    configPath: '/tmp/config.toml',
    providerName: 'deepseek',
    model: 'deepseek-chat',
    mcpServers: {},
    providers: [],
    contextLimit: 120000,
    toolPermissionMode: 'once' as const,
}

describe('slash registry', () => {
    test('help text contains key commands', () => {
        const help = buildHelpText()
        assert.ok(help.includes('/help'))
        assert.ok(help.includes('/models'))
    })

    test('unknown command returns message', () => {
        const result = resolveSlashCommand('/$ foo', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Unknown')
    })

    test('context command validates values', () => {
        const result = resolveSlashCommand('/context 100k', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Context')
    })

    test('tools command resolves mode switch', () => {
        const result = resolveSlashCommand('/tools full', context)
        assert.strictEqual(result.kind, 'set_tool_permission')
        if (result.kind === 'set_tool_permission') {
            assert.strictEqual(result.mode, 'full')
        }
    })
})
