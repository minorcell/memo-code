export type WebCliOptions = {
    host?: string
    port?: number
    open: boolean
    staticDir?: string
}

function parsePort(value: string): number | null {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return null
    return parsed
}

export function parseWebArgs(argv: string[]): WebCliOptions {
    const options: WebCliOptions = {
        open: true,
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg) continue

        if (arg === '--open') {
            options.open = true
            continue
        }
        if (arg === '--no-open') {
            options.open = false
            continue
        }
        if (arg === '--host') {
            const value = argv[i + 1]
            if (value && !value.startsWith('-')) {
                options.host = value
                i += 1
            }
            continue
        }
        if (arg === '--port') {
            const value = argv[i + 1]
            if (value && !value.startsWith('-')) {
                const parsed = parsePort(value)
                if (parsed !== null) {
                    options.port = parsed
                    i += 1
                }
            }
            continue
        }
        if (arg === '--static-dir') {
            const value = argv[i + 1]
            if (value && !value.startsWith('-')) {
                options.staticDir = value
                i += 1
            }
            continue
        }
    }

    return options
}
