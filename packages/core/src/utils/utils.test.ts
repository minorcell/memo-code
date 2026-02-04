import { describe, expect, test } from 'vitest'
import { buildThinking, parseAssistant } from '@memo/core/utils/utils'

describe('parseAssistant thinking extraction', () => {
    test('strips <think> tags and keeps inner text', () => {
        const message = '<think>plan steps here</think>\n{"tool":"bash","input":{"command":"ls"}}'
        const parsed = parseAssistant(message)

        expect(parsed.action?.tool).toBe('bash')
        expect(parsed.thinking).toBe('plan steps here')
    })

    test('handles <thinking> variant', () => {
        const message =
            '<thinking>考虑一下路径</thinking>\n{"tool":"read","input":{"path":"README.md"}}'
        const parsed = parseAssistant(message)

        expect(parsed.action?.tool).toBe('read')
        expect(parsed.thinking).toBe('考虑一下路径')
    })

    test('returns original text when no tags exist', () => {
        const message = 'plain reasoning\n{"tool":"bash","input":{"command":"pwd"}}'
        const parsed = parseAssistant(message)

        expect(parsed.action?.tool).toBe('bash')
        expect(parsed.thinking).toBe('plain reasoning')
    })

    test('repairs invalid JSON with unescaped quotes inside command', () => {
        const message = `{"tool":"bash","input":{"command":"grep -r "Claude Code" --include="*.go" | head -5"}}`
        const parsed = parseAssistant(message)

        const command = (parsed.action?.input as { command?: string } | undefined)?.command
        expect(parsed.action?.tool).toBe('bash')
        expect(command).toBe('grep -r "Claude Code" --include="*.go" | head -5')
    })
})

describe('buildThinking helper', () => {
    test('aggregates multiple think blocks', () => {
        const thinking = buildThinking([
            '<think>first</think>',
            'ignored',
            '<thinking>second</thinking>',
        ])
        expect(thinking).toBe('first\n\nsecond')
    })
})

describe('parseAssistant dirty JSON handling', () => {
    test('handles JSON with newlines inside code block', () => {
        const message = `
\`\`\`
{"tool":"todo","input":{"type":"replace","todos":[{"id":"1","content":"task1","status":"in_progress"}]}}
mcell@memo-cli ▊
\`\`\`
        `.trim()
        const parsed = parseAssistant(message)

        expect(parsed.action?.tool).toBe('todo')
        const input = parsed.action?.input as {
            type: string
            todos: Array<{ id: string; content: string }>
        }
        expect(input?.type).toBe('replace')
        expect(input?.todos[0]?.content).toBe('task1')
    })

    test('handles JSON with newlines in plain text', () => {
        const message = `{"tool":"todo","input":{"type":"replace","todos":[{"id":"1","content":"task1"
,"status":"in_progress"},{"id":"2","content":"task2","status":"pending"}]}}
mcell@memo-cli ▊`
        const parsed = parseAssistant(message)

        expect(parsed.action?.tool).toBe('todo')
        const input = parsed.action?.input as {
            type: string
            todos: Array<{ id: string; content: string }>
        }
        expect(input?.todos).toHaveLength(2)
        expect(input?.todos[0]?.content).toBe('task1')
        expect(input?.todos[1]?.content).toBe('task2')
    })
})
