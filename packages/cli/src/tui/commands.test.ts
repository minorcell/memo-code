import assert from 'node:assert'
import { describe, test } from 'vitest'
import { resolveSlashCommand } from './commands'

const context = {
    configPath: '/tmp/config.toml',
    providerName: 'test-provider',
    model: 'test-model',
    mcpServers: {},
    providers: [],
    contextLimit: 120000,
}

describe('resolveSlashCommand', () => {
    test('treats /$ command as unknown', () => {
        const result = resolveSlashCommand('/$ git status', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Unknown')
        assert.ok(result.content.includes('Unknown command: /$ git status'))
    })

    test('help does not include shell execution command', () => {
        const result = resolveSlashCommand('/help', context)
        assert.strictEqual(result.kind, 'message')
        assert.strictEqual(result.title, 'Help')
        assert.ok(!result.content.includes('Execute shell command'))
        assert.ok(!result.content.includes('\n  $'))
    })
})
