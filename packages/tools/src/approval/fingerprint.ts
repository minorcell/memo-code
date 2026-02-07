/** @file 工具请求指纹生成 */

import { createHash } from 'node:crypto'
import type { ApprovalKey } from './types'

/** 稳定序列化对象（确保相同参数生成相同字符串） */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }

    if (Array.isArray(value)) {
        return '[' + value.map((v) => stableStringify(v)).join(',') + ']'
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** 生成工具请求的指纹 */
export function generateFingerprint(toolName: string, params: unknown): ApprovalKey {
    const normalized = stableStringify(params)
    const raw = `${toolName}:${normalized}`
    return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/** 生成部分参数指纹（用于模糊匹配） */
export function generatePartialFingerprint(
    toolName: string,
    params: unknown,
    keys: string[],
): ApprovalKey {
    if (typeof params !== 'object' || params === null) {
        return generateFingerprint(toolName, params)
    }

    const filtered: Record<string, unknown> = {}
    for (const key of keys) {
        if (key in params) {
            filtered[key] = (params as Record<string, unknown>)[key]
        }
    }

    return generateFingerprint(toolName, filtered)
}
