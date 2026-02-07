import { z } from 'zod'
import { extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { access, readFile } from 'node:fs/promises'
import { normalizePath } from '@memo/tools/tools/helpers'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const MAX_BYTES = 512_000
const MAX_IMAGE_BYTES = 2_000_000
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1_000
const BINARY_PROBE_LENGTH = 1024
const MAX_BASE64_PREVIEW = 4000

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

function isImagePath(path: string) {
    const ext = extname(path).toLowerCase()
    return IMAGE_EXTS.has(ext)
}

function bufferToBase64(data: Uint8Array) {
    return Buffer.from(data).toString('base64')
}

function compressIfBeneficial(bytes: Uint8Array) {
    try {
        const compressed = gzipSync(bytes, { level: 6 })
        if (compressed.byteLength < bytes.byteLength) {
            return { data: new Uint8Array(compressed), encoding: 'gzip+base64' as const }
        }
    } catch {
        /* gzip may fail; fall back */
    }
    return { data: bytes, encoding: 'base64' as const }
}

function formatBase64Response(params: {
    encoding: string
    base64: string
    originalBytes: number
    payloadBytes: number
    truncated: boolean
}) {
    const note = params.truncated ? ' truncated=true' : ''
    return `image_base64 (encoding=${params.encoding} original_bytes=${params.originalBytes} payload_bytes=${params.payloadBytes} base64_length=${params.base64.length}${note}): ${params.base64}`
}

const READ_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
    })
    .strict()

type ReadInput = z.infer<typeof READ_INPUT_SCHEMA>

export const readTool = defineMcpTool<ReadInput>({
    name: 'read',
    description: '读取指定文件内容，可按 offset/limit 截取并附带行号',
    inputSchema: READ_INPUT_SCHEMA,
    execute: async (input) => {
        const path = normalizePath(input.file_path)
        const offset = input.offset ?? 1
        const requestedLimit = input.limit ?? DEFAULT_LIMIT
        const limit = Math.min(requestedLimit, MAX_LIMIT)

        try {
            await access(path)
            const buffer = await readFile(path)
            const size = buffer.byteLength
            const isImage = isImagePath(path)

            // 图片：压缩+base64 返回，防止上下文膨胀
            if (isImage) {
                if (size > MAX_IMAGE_BYTES) {
                    return textResult(
                        `图片过大（${size} bytes），超过阈值 ${MAX_IMAGE_BYTES} bytes，已拒绝读取`,
                        true,
                    )
                }
                const bytes = new Uint8Array(buffer)
                const { data, encoding } = compressIfBeneficial(bytes)
                const base64Full = bufferToBase64(data)
                const truncated =
                    base64Full.length > MAX_BASE64_PREVIEW
                        ? `${base64Full.slice(0, MAX_BASE64_PREVIEW)}...`
                        : base64Full
                const isTruncated = base64Full.length > MAX_BASE64_PREVIEW
                return textResult(
                    formatBase64Response({
                        encoding,
                        base64: truncated,
                        originalBytes: bytes.byteLength,
                        payloadBytes: data.byteLength,
                        truncated: isTruncated,
                    }),
                )
            }

            // 文本读取（大文件/二进制防护）
            if (size > MAX_BYTES) {
                return textResult(
                    `文件过大（${size} bytes），已拒绝读取，阈值 ${MAX_BYTES} bytes`,
                    true,
                )
            }

            const probe = new Uint8Array(buffer)
            const probeLength = Math.min(probe.length, BINARY_PROBE_LENGTH)
            for (let i = 0; i < probeLength; i++) {
                if (probe[i] === 0) {
                    return textResult('检测到二进制内容，已拒绝直接读取', true)
                }
            }

            const content = new TextDecoder().decode(probe)
            const lines = content.split(/\r?\n/)
            const startIdx = Math.max(0, offset - 1)
            const endIdx = Math.min(lines.length, startIdx + limit)
            const sliced = lines.slice(startIdx, endIdx)
            const withNumbers = sliced.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n')
            const hasMore = endIdx < lines.length
            const capped = requestedLimit !== limit
            const truncated = capped || (hasMore && input.limit === undefined)
            const note = truncated
                ? `\n... (truncated, showing ${limit} lines; max=${MAX_LIMIT})`
                : ''
            return textResult(withNumbers + note)
        } catch (err) {
            return textResult(`读取失败: ${(err as Error).message}`, true)
        }
    },
})
