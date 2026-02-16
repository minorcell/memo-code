const SUBCOMMANDS = ['mcp', 'web'] as const

type SubcommandName = (typeof SUBCOMMANDS)[number]

export type CliRoute =
    | {
          kind: 'subcommand'
          name: SubcommandName
          args: string[]
      }
    | {
          kind: 'default'
          args: string[]
      }

function parseCommandToken(argv: string[]): { token: string | null; offset: number } {
    if (argv.length === 0) return { token: null, offset: 0 }
    if (argv[0] === '--') {
        return { token: argv[1] ?? null, offset: 2 }
    }
    return { token: argv[0] ?? null, offset: 1 }
}

function isSubcommandName(name: string): name is SubcommandName {
    return (SUBCOMMANDS as readonly string[]).includes(name)
}

/** Routes CLI argv to a subcommand handler or default chat flow. */
export function routeCli(argv: string[]): CliRoute {
    const { token, offset } = parseCommandToken(argv)
    if (token && isSubcommandName(token)) {
        return {
            kind: 'subcommand',
            name: token,
            args: argv.slice(offset),
        }
    }
    return {
        kind: 'default',
        args: argv,
    }
}
