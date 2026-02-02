import assert from 'node:assert'
import { describe, test } from 'vitest'
import { webfetchTool } from '@memo/tools/tools/webfetch'

describe('webfetch tool', () => {
    test('requires url', async () => {
        const res = await webfetchTool.inputSchema.safeParse({ url: '' })
        assert.strictEqual(res.success, false)
    })

    test('fetches data url content', async () => {
        const res = await webfetchTool.execute({ url: 'data:text/plain,hello' })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('status=200'))
        assert.ok(text.includes('text="hello"'))
    })

    test('returns plain text when body is html', async () => {
        const html = encodeURIComponent('<html><body><h1>Hello</h1><p>World</p></body></html>')
        const res = await webfetchTool.execute({ url: `data:text/html,${html}` })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(!text.includes('<h1>'), 'should strip HTML tags')
        assert.ok(text.includes('Hello'), 'should keep visible text')
        assert.ok(text.includes('World'), 'should keep paragraph text')
    })

    test('rejects unsupported protocol', async () => {
        const res = await webfetchTool.execute({ url: 'file:///etc/hosts' })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('不支持的协议'), 'should block file:// scheme')
    })

    test('aborts when body is too large', async () => {
        const large = 'a'.repeat(600_000)
        const res = await webfetchTool.execute({ url: `data:text/plain,${large}` })
        const text = res.content?.[0]?.type === 'text' ? res.content[0].text : ''
        assert.ok(text.includes('响应体超过'), 'should enforce size limit')
    })
})
