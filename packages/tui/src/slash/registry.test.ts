import assert from 'node:assert'
import { describe, test } from 'vitest'
import { resolveSlashCommand, buildHelpText } from './registry'

const context = {
    configPath: '/tmp/config.toml',
    providerName: 'deepseek',
    model: 'deepseek-chat',
    mcpServers: {},
    providers: [],
    toolPermissionMode: 'once' as const,
}

describe('slash registry', () => {
    test('help text contains key commands', () => {
        const help = buildHelpText()
        assert.ok(help.includes('/help'))
        assert.ok(help.includes('/models'))
        assert.ok(help.includes('/compact'))
        assert.ok(!help.includes('/context'))
    })

    test('unknown command returns message', () => {
        const result = resolveSlashCommand('/$ foo', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Unknown')
    })

    test('tools command resolves mode switch', () => {
        const result = resolveSlashCommand('/tools full', context)
        assert.strictEqual(result.kind, 'set_tool_permission')
        if (result.kind === 'set_tool_permission') {
            assert.strictEqual(result.mode, 'full')
        }
    })

    test('context command is removed and treated as unknown', () => {
        const result = resolveSlashCommand('/context 120k', context)
        assert.strictEqual(result.kind, 'message')
        if (result.kind === 'message') {
            assert.strictEqual(result.title, 'Unknown')
        }
    })

    test('review command parses PR number', () => {
        const result = resolveSlashCommand('/review 999', context)
        assert.strictEqual(result.kind, 'review_pr')
        if (result.kind === 'review_pr') {
            assert.strictEqual(result.prNumber, 999)
        }
    })

    test('review command parses PR URL', () => {
        const result = resolveSlashCommand('/review https://github.com/acme/repo/pull/123', context)
        assert.strictEqual(result.kind, 'review_pr')
        if (result.kind === 'review_pr') {
            assert.strictEqual(result.prNumber, 123)
        }
    })

    test('review command validates missing argument', () => {
        const result = resolveSlashCommand('/review', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Review')
    })

    test('compact command resolves correctly', () => {
        const result = resolveSlashCommand('/compact', context)
        assert.strictEqual(result.kind, 'compact')
    })
})
