export type CliOptions = {
    dangerous: boolean
    showVersion: boolean
    once: boolean
    prev: boolean
}

export type ParsedArgs = {
    question: string
    options: CliOptions
}

/** Minimal argv parsing for memo CLI flags. */
export function parseArgs(argv: string[]): ParsedArgs {
    const options: CliOptions = {
        dangerous: false,
        showVersion: false,
        once: false,
        prev: false,
    }
    const questionParts: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === undefined) continue

        if (arg === '--version' || arg === '-v') {
            options.showVersion = true
            continue
        }
        if (arg === '--once' || arg === '-once') {
            options.once = true
            continue
        }
        if (arg === '--prev' || arg === '-prev') {
            options.prev = true
            continue
        }
        if (arg === '--dangerous' || arg === '-d') {
            options.dangerous = true
            continue
        }
        questionParts.push(arg)
    }

    return { question: questionParts.join(' '), options }
}
