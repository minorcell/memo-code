import assert from 'node:assert'
import { describe, test } from 'vitest'
import { loadTaskPrompt } from './task_prompt'

describe('task prompt loader', () => {
    test('loads init prompt markdown', async () => {
        const prompt = await loadTaskPrompt('init_agents')
        assert.ok(prompt.includes('Generate a file named AGENTS.md'))
    })

    test('renders template variables for review prompt', async () => {
        const prompt = await loadTaskPrompt('review_pull_request', {
            pr_number: '123',
            backend_strategy: 'gh_cli',
            backend_details: 'Using gh CLI',
            mcp_server_prefix: 'github',
        })
        assert.ok(prompt.includes('Target PR number: 123'))
        assert.ok(prompt.includes('Backend strategy (selected by runtime): gh_cli'))
    })
})
