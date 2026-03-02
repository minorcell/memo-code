import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { CoreAuth, CoreAuthError } from '@memo/core/server/handler/auth'
import { McpAdminError } from '@memo/core/runtime/mcp_admin'
import { SkillsAdminError } from '@memo/core/runtime/skills_admin'
import type { ApiEnvelope, OpenApiError } from '@memo/core/web/types'

const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024

export type CoreCorsOptions = {
    origin?: string | string[] | '*'
}

export class HttpApiError extends Error {
    constructor(
        readonly statusCode: number,
        readonly code: string,
        message: string,
        readonly details?: unknown,
    ) {
        super(message)
    }
}

function parseAuthorizationToken(req: IncomingMessage): string | null {
    const header = req.headers.authorization
    if (!header || typeof header !== 'string') return null
    if (!header.startsWith('Bearer ')) return null
    return header.slice('Bearer '.length).trim()
}

function toEnvelope<T>(requestId: string, payload: T): ApiEnvelope<T> {
    return {
        success: true,
        data: payload,
        meta: {
            requestId,
            timestamp: new Date().toISOString(),
        },
    }
}

function toErrorEnvelope(requestId: string, path: string, error: OpenApiError): ApiEnvelope<never> {
    return {
        success: false,
        error: {
            code: error.code,
            message: error.message,
            details: error.details,
        },
        meta: {
            requestId,
            timestamp: new Date().toISOString(),
            path,
        },
    }
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
}

export function writeSuccess<T>(res: ServerResponse, requestId: string, data: T): void {
    writeJson(res, 200, toEnvelope(requestId, data))
}

export function writeNoContent(res: ServerResponse): void {
    res.statusCode = 204
    res.end()
}

export function writeError(
    res: ServerResponse,
    requestId: string,
    path: string,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
): void {
    writeJson(
        res,
        statusCode,
        toErrorEnvelope(requestId, path, {
            code,
            message,
            details,
        }),
    )
}

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let totalBytes = 0

    for await (const chunk of req) {
        const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        totalBytes += asBuffer.byteLength
        if (totalBytes > MAX_JSON_BODY_BYTES) {
            throw new HttpApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
        }
        chunks.push(asBuffer)
    }

    return Buffer.concat(chunks).toString('utf8')
}

export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const text = await readBody(req)
    if (!text.trim()) return {}

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        throw new HttpApiError(400, 'BAD_JSON', 'Request body must be valid JSON')
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new HttpApiError(400, 'BAD_JSON', 'JSON body must be an object')
    }

    return parsed as Record<string, unknown>
}

export function requireString(
    input: Record<string, unknown>,
    field: string,
    errorMessage = `${field} is required`,
): string {
    const value = input[field]
    if (typeof value !== 'string') {
        throw new HttpApiError(400, 'BAD_REQUEST', errorMessage)
    }
    const trimmed = value.trim()
    if (!trimmed) {
        throw new HttpApiError(400, 'BAD_REQUEST', errorMessage)
    }
    return trimmed
}

export function parseInteger(value: string | null, fallback: number): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed)) return fallback
    return parsed
}

export function normalizeError(error: unknown): HttpApiError {
    if (error instanceof HttpApiError) return error

    if (error instanceof CoreAuthError) {
        if (error.code === 'INVALID_CREDENTIALS') {
            return new HttpApiError(401, 'INVALID_CREDENTIALS', error.message)
        }
        if (error.code === 'TOKEN_EXPIRED') {
            return new HttpApiError(401, 'TOKEN_EXPIRED', error.message)
        }
        return new HttpApiError(401, 'TOKEN_INVALID', error.message)
    }

    if (error instanceof McpAdminError) {
        const statusCode = error.code === 'NOT_FOUND' ? 404 : 400
        return new HttpApiError(statusCode, error.code, error.message)
    }

    if (error instanceof SkillsAdminError) {
        const statusCode = error.code === 'NOT_FOUND' ? 404 : 400
        return new HttpApiError(statusCode, error.code, error.message)
    }

    const message = (error as Error)?.message || 'Internal server error'
    if (message.startsWith('session not found')) {
        return new HttpApiError(404, 'SESSION_NOT_FOUND', message)
    }
    if (message.startsWith('approval not found')) {
        return new HttpApiError(404, 'APPROVAL_NOT_FOUND', message)
    }
    if (message.includes('queue is full')) {
        return new HttpApiError(409, 'QUEUE_FULL', message)
    }
    if (message.includes('Too many live sessions')) {
        return new HttpApiError(429, 'TOO_MANY_SESSIONS', message)
    }

    return new HttpApiError(500, 'INTERNAL_ERROR', message)
}

export function ensureAuth(auth: CoreAuth, req: IncomingMessage): void {
    const token = parseAuthorizationToken(req)
    if (!token) {
        throw new HttpApiError(401, 'UNAUTHORIZED', 'Missing Bearer token')
    }
    auth.verify(token)
}

export function applyCors(
    req: IncomingMessage,
    res: ServerResponse,
    options: CoreCorsOptions | undefined,
): void {
    const originHeader = req.headers.origin
    const allowedOrigin = options?.origin ?? '*'

    if (allowedOrigin === '*') {
        res.setHeader('Access-Control-Allow-Origin', '*')
    } else if (Array.isArray(allowedOrigin)) {
        const matched =
            typeof originHeader === 'string'
                ? allowedOrigin.find((item) => item === originHeader)
                : undefined
        if (matched) {
            res.setHeader('Access-Control-Allow-Origin', matched)
        }
    } else if (typeof allowedOrigin === 'string') {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')
}

function getContentType(filePath: string): string {
    const ext = extname(filePath).toLowerCase()
    if (ext === '.html') return 'text/html; charset=utf-8'
    if (ext === '.js') return 'application/javascript; charset=utf-8'
    if (ext === '.css') return 'text/css; charset=utf-8'
    if (ext === '.json') return 'application/json; charset=utf-8'
    if (ext === '.svg') return 'image/svg+xml'
    if (ext === '.png') return 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.woff') return 'font/woff'
    if (ext === '.woff2') return 'font/woff2'
    return 'application/octet-stream'
}

export async function serveStatic(
    staticDir: string,
    reqPath: string,
    res: ServerResponse,
): Promise<boolean> {
    const root = resolve(staticDir)
    const decodedPath = decodeURIComponent(reqPath)
    const rawTarget = decodedPath === '/' ? '/index.html' : decodedPath

    const resolveCandidate = (relativePath: string) => {
        const resolved = resolve(join(root, relativePath))
        if (resolved !== root && !resolved.startsWith(`${root}/`)) {
            throw new HttpApiError(403, 'FORBIDDEN', 'Invalid static path')
        }
        return resolved
    }

    const hasExtension = extname(rawTarget).length > 0
    const candidates = hasExtension ? [rawTarget] : [rawTarget, '/index.html']

    for (const candidate of candidates) {
        const relative = candidate.startsWith('/') ? candidate.slice(1) : candidate
        const absolute = resolveCandidate(relative)
        try {
            const fileStat = await stat(absolute)
            if (!fileStat.isFile()) continue
            const content = await readFile(absolute)
            res.statusCode = 200
            res.setHeader('Content-Type', getContentType(absolute))
            res.end(content)
            return true
        } catch {
            // Try next candidate.
        }
    }

    if (!hasExtension) {
        const fallback = resolveCandidate('index.html')
        try {
            const content = await readFile(fallback)
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(content)
            return true
        } catch {
            // fall through
        }
    }

    return false
}
