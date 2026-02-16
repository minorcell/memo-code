export function getErrorMessage(error: unknown, fallback = 'Operation failed'): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }
    if (typeof error === 'string' && error.trim()) {
        return error
    }
    return fallback
}
