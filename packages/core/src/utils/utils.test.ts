import { describe, expect, test } from 'bun:test'
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
