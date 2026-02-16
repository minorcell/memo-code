import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { getWebfetchPreviewChars } from '@memo/tools/runtime/tool_output_limits'

const WEBFETCH_INPUT_SCHEMA = z
    .object({
        url: z.string().min(1),
    })
    .strict()

type WebFetchInput = z.infer<typeof WEBFETCH_INPUT_SCHEMA>

const WEBFETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 512_000
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const HTML_BREAK_TAG =
    /<\/\s*(p|div|section|article|header|footer|aside|main|h[1-6]|li|tr|table|blockquote)\s*>/gi
const HTML_LINE_BREAK = /<\s*(br|hr)\s*\/?>/gi
const HTML_LIST_ITEM = /<\s*li[^>]*>/gi
const HTML_TAG = /<[^>]+>/g
const HTML_SCRIPT_STYLE = /<(script|style)[^>]*>[\s\S]*?<\/\s*\1>/gi

const decodeEntities = (input: string) => {
    const base = input
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")

    const numeric = base.replace(/&#(x?[0-9a-fA-F]+);/g, (_, code: string) => {
        try {
            const value =
                code.startsWith('x') || code.startsWith('X')
                    ? parseInt(code.slice(1), 16)
                    : parseInt(code, 10)
            return Number.isFinite(value) ? String.fromCharCode(value) : ''
        } catch {
            return ''
        }
    })

    return numeric
}

const htmlToPlainText = (html: string) => {
    const withoutScriptStyle = html.replace(HTML_SCRIPT_STYLE, ' ')
    const withBreaks = withoutScriptStyle
        .replace(HTML_LIST_ITEM, '- ')
        .replace(HTML_LINE_BREAK, '\n')
        .replace(HTML_BREAK_TAG, '\n')
    const stripped = withBreaks.replace(HTML_TAG, ' ')
    const decoded = decodeEntities(stripped)

    const lines = decoded
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim().replace(/[ \t]{2,}/g, ' '))
    const normalizedLines = lines.filter(
        (line, idx) => line.length > 0 || (idx > 0 && (lines[idx - 1]?.length ?? 0) > 0),
    )
    return normalizedLines.join('\n').trim()
}

const sanitizePreview = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * WebFetch: limited HTTP GET, returns plain text (strips and decodes HTML), with timeout and size limits.
 */
export const webfetchTool = defineMcpTool<WebFetchInput>({
    name: 'webfetch',
    description:
        'HTTP GET request, returns processed plain text body (automatically strips HTML tags)',
    inputSchema: WEBFETCH_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async (input) => {
        let url: URL
        try {
            url = new URL(input.url)
        } catch {
            return textResult(`Invalid URL: ${input.url}`, true)
        }
        if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
            return textResult(`Unsupported protocol: ${url.protocol}`, true)
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), WEBFETCH_TIMEOUT_MS)
        try {
            const res = await globalThis.fetch(url, { signal: controller.signal })
            const lengthHeader = res.headers.get('content-length')
            const declaredLength = lengthHeader ? Number(lengthHeader) : undefined
            if (declaredLength && declaredLength > MAX_BODY_BYTES) {
                return textResult(
                    `Request rejected: response body too large (${declaredLength} bytes)`,
                    true,
                )
            }

            let consumedBytes = 0
            let bodyText = ''

            if (res.body && res.body.getReader) {
                const reader = res.body.getReader()
                const chunks: Uint8Array[] = []
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    if (!value) continue
                    consumedBytes += value.byteLength
                    if (consumedBytes > MAX_BODY_BYTES) {
                        controller.abort()
                        return textResult(
                            `Request aborted: response body exceeds ${MAX_BODY_BYTES} bytes`,
                            true,
                        )
                    }
                    chunks.push(value)
                }
                const merged = new Uint8Array(consumedBytes)
                let offset = 0
                for (const chunk of chunks) {
                    merged.set(chunk, offset)
                    offset += chunk.byteLength
                }
                bodyText = new TextDecoder().decode(merged)
            } else {
                bodyText = await res.text()
                consumedBytes = new TextEncoder().encode(bodyText).byteLength
                if (consumedBytes > MAX_BODY_BYTES) {
                    return textResult(
                        `Request rejected: response body exceeds ${MAX_BODY_BYTES} bytes`,
                        true,
                    )
                }
            }

            const contentType = res.headers.get('content-type') || ''
            const looksLikeHtml =
                /text\/html/i.test(contentType) ||
                /^\s*<!doctype html/i.test(bodyText) ||
                /^\s*<html[\s>]/i.test(bodyText)

            const plainText = looksLikeHtml ? htmlToPlainText(bodyText) : bodyText.trim()
            const normalizedText = sanitizePreview(plainText)
            const previewLimit = getWebfetchPreviewChars()

            const preview =
                normalizedText.length > previewLimit
                    ? `${normalizedText.slice(0, previewLimit)}...`
                    : normalizedText
            const truncatedNote = normalizedText.length > previewLimit ? ' text_truncated=true' : ''
            const formatNote = looksLikeHtml ? ' source=html_stripped' : ''

            return textResult(
                `status=${res.status} bytes=${consumedBytes} text_chars=${normalizedText.length} text="${preview}"${truncatedNote}${formatNote}`,
            )
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                return textResult(`Request timeout or aborted (${WEBFETCH_TIMEOUT_MS}ms)`, true)
            }
            return textResult(`Request failed: ${(err as Error).message}`, true)
        } finally {
            clearTimeout(timer)
        }
    },
})
