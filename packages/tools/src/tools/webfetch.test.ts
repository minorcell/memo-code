import assert from 'node:assert'
import { describe, test } from 'vitest'
import { webfetchTool } from '@memo/tools/tools/webfetch'

function textPayload(result: { content?: Array<{ type: string; text?: string }> }) {
    return result.content?.find((item) => item.type === 'text')?.text ?? ''
}

async function withMockFetch(
    mock: typeof globalThis.fetch,
    run: () => Promise<void>,
): Promise<void> {
    const original = globalThis.fetch
    Object.assign(globalThis, { fetch: mock })
    try {
        await run()
    } finally {
        Object.assign(globalThis, { fetch: original })
    }
}

describe('webfetch tool', () => {
    test('requires url', async () => {
        const res = webfetchTool.validateInput?.({ url: '' })
        assert.ok(res && !res.ok)
    })

    test('rejects data protocol', async () => {
        const res = await webfetchTool.execute({ url: 'data:text/plain,hello' })
        const text = textPayload(res)
        assert.strictEqual(res.isError, true)
        assert.ok(text.includes('Unsupported protocol'))
    })

    test('returns plain text when body is html', async () => {
        await withMockFetch(
            async () =>
                new Response('<html><body><h1>Hello</h1><p>World</p></body></html>', {
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                }),
            async () => {
                const res = await webfetchTool.execute({ url: 'https://example.com' })
                const text = textPayload(res)
                assert.ok(!text.includes('<h1>'), 'should strip HTML tags')
                assert.ok(text.includes('Hello'), 'should keep visible text')
                assert.ok(text.includes('World'), 'should keep paragraph text')
            },
        )
    })

    test('rejects unsupported protocol', async () => {
        const res = await webfetchTool.execute({ url: 'file:///etc/hosts' })
        const text = textPayload(res)
        assert.ok(text.includes('Unsupported protocol'), 'should block file:// scheme')
    })

    test('aborts when body is too large', async () => {
        await withMockFetch(
            async () =>
                new Response('ignored', {
                    status: 200,
                    headers: { 'content-length': '600000' },
                }),
            async () => {
                const res = await webfetchTool.execute({ url: 'https://example.com/large' })
                const text = textPayload(res)
                assert.strictEqual(res.isError, true)
                assert.ok(text.includes('response body too large'), 'should enforce size limit')
            },
        )
    })
})
