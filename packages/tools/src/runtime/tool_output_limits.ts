const DEFAULT_MAX_TOOL_RESULT_CHARS = 20_000
const DEFAULT_MIN_TOOL_RESULT_LINES = 100
const DEFAULT_WEBFETCH_PREVIEW_CHARS = 12_000
const WEBFETCH_PREVIEW_RATIO = 0.6

function parsePositiveInt(raw: string | undefined): number | null {
    const value = raw?.trim()
    if (!value) return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.floor(parsed)
}

export function getMaxToolResultChars() {
    return parsePositiveInt(process.env.MEMO_TOOL_RESULT_MAX_CHARS) ?? DEFAULT_MAX_TOOL_RESULT_CHARS
}

export function getMaxToolResultLines() {
    return Math.max(DEFAULT_MIN_TOOL_RESULT_LINES, Math.floor(getMaxToolResultChars() / 120))
}

export function getWebfetchPreviewChars() {
    const maxChars = getMaxToolResultChars()
    const headroom = Math.max(16, Math.floor(maxChars * 0.25))
    const hardCap = Math.max(32, maxChars - headroom)
    const softCap = Math.max(32, Math.floor(maxChars * WEBFETCH_PREVIEW_RATIO))
    return Math.min(DEFAULT_WEBFETCH_PREVIEW_CHARS, softCap, hardCap)
}
