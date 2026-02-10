import { loadMemoConfig, writeMemoConfig, type MCPServerConfig } from '@memo/core'

type McpCommand = 'list' | 'get' | 'add' | 'remove' | 'login' | 'logout' | 'help'

type AddOptions = {
    name: string
    url?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    bearerTokenEnvVar?: string
}

const HELP_TEXT = `
Usage:
  memo mcp list [--json]
  memo mcp get <name> [--json]
  memo mcp add <name> -- <command...> [--env KEY=VALUE]...
  memo mcp add <name> --url <value> [--bearer-token-env-var ENV_VAR]
  memo mcp remove <name>
  memo mcp login <name> [--scopes scope1,scope2]
  memo mcp logout <name>
`

function printHelp() {
    console.log(HELP_TEXT.trim())
}

function parseEnvAssignment(raw: string): { key: string; value: string } | null {
    const index = raw.indexOf('=')
    if (index <= 0) return null
    const key = raw.slice(0, index).trim()
    const value = raw.slice(index + 1)
    if (!key) return null
    return { key, value }
}

function formatServer(name: string, config: MCPServerConfig): string {
    const lines: string[] = []
    lines.push(`${name}`)
    if ('url' in config) {
        lines.push(`  type: ${config.type ?? 'streamable_http'}`)
        lines.push(`  url: ${config.url}`)
        if (config.bearer_token_env_var) {
            lines.push(`  bearer_token_env_var: ${config.bearer_token_env_var}`)
        }
        const headers = config.http_headers ?? config.headers
        if (headers && Object.keys(headers).length > 0) {
            lines.push(
                `  headers: ${Object.entries(headers)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}`,
            )
        }
    } else {
        lines.push(`  type: ${config.type ?? 'stdio'}`)
        lines.push(`  command: ${config.command}`)
        if (config.args && config.args.length > 0) {
            lines.push(`  args: ${config.args.join(' ')}`)
        }
        if (config.env && Object.keys(config.env).length > 0) {
            lines.push(
                `  env: ${Object.entries(config.env)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}`,
            )
        }
    }
    return lines.join('\n')
}

function parseAddArgs(args: string[]): { options?: AddOptions; error?: string } {
    const name = args.shift()
    if (!name) return { error: 'Missing server name.' }

    let url: string | undefined
    let bearerTokenEnvVar: string | undefined
    const env: Record<string, string> = {}
    let commandArgs: string[] = []

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (!arg) continue
        if (arg === '--') {
            commandArgs = args.slice(i + 1)
            break
        }
        if (arg === '--url') {
            const next = args[i + 1]
            if (!next) return { error: 'Missing value for --url.' }
            url = next
            i += 1
            continue
        }
        if (arg === '--bearer-token-env-var') {
            const next = args[i + 1]
            if (!next) return { error: 'Missing value for --bearer-token-env-var.' }
            bearerTokenEnvVar = next
            i += 1
            continue
        }
        if (arg === '--env') {
            const next = args[i + 1]
            if (!next) return { error: 'Missing value for --env (KEY=VALUE).' }
            const parsed = parseEnvAssignment(next)
            if (!parsed) return { error: 'Invalid --env format. Use KEY=VALUE.' }
            env[parsed.key] = parsed.value
            i += 1
            continue
        }
        if (arg === '--help' || arg === '-h') {
            return { error: '' }
        }
        return { error: `Unknown option: ${arg}` }
    }

    if (url) {
        if (commandArgs.length > 0) {
            return { error: 'Use either --url or a stdio command, not both.' }
        }
        if (Object.keys(env).length > 0) {
            return { error: '--env is only supported with stdio servers.' }
        }
        return {
            options: {
                name,
                url,
                bearerTokenEnvVar,
            },
        }
    }

    if (bearerTokenEnvVar) {
        return { error: '--bearer-token-env-var is only supported with HTTP servers.' }
    }

    if (commandArgs.length === 0) {
        return { error: 'Missing stdio command. Use `-- <command...>`.' }
    }

    return {
        options: {
            name,
            command: commandArgs[0],
            args: commandArgs.slice(1),
            env: Object.keys(env).length > 0 ? env : undefined,
        },
    }
}

function parseCommand(args: string[]): { command: McpCommand; rest: string[] } {
    const [raw, ...rest] = args
    if (!raw || raw === '--help' || raw === '-h' || raw === 'help') {
        return { command: 'help', rest: [] }
    }
    const command = raw as McpCommand
    return { command, rest }
}

function pickName(rest: string[], flagsWithValue: string[] = []): string | null {
    const flags = new Set(flagsWithValue)
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i]
        if (!arg) continue
        if (arg.startsWith('--')) {
            if (flags.has(arg)) {
                i += 1
            }
            continue
        }
        return arg
    }
    return null
}

export async function runMcpCommand(args: string[]): Promise<void> {
    const { command, rest } = parseCommand(args)

    if (command === 'help') {
        printHelp()
        return
    }

    if (command === 'list') {
        const json = rest.includes('--json')
        const loaded = await loadMemoConfig()
        const servers = loaded.config.mcp_servers ?? {}
        if (json) {
            console.log(JSON.stringify(servers, null, 2))
            return
        }
        const names = Object.keys(servers)
        if (names.length === 0) {
            console.log(`No MCP servers configured. Add one with "memo mcp add".`)
            return
        }
        console.log(`MCP servers (${names.length}):`)
        for (const name of names) {
            const config = servers[name]
            if (!config) continue
            console.log(formatServer(name, config))
        }
        return
    }

    if (command === 'get') {
        const json = rest.includes('--json')
        const name = pickName(rest)
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }
        const loaded = await loadMemoConfig()
        const server = loaded.config.mcp_servers?.[name]
        if (!server) {
            console.error(`Unknown MCP server "${name}".`)
            process.exitCode = 1
            return
        }
        if (json) {
            console.log(JSON.stringify(server, null, 2))
            return
        }
        console.log(formatServer(name, server))
        return
    }

    if (command === 'add') {
        const parsed = parseAddArgs(rest)
        if (parsed.error !== undefined) {
            if (parsed.error) {
                console.error(parsed.error)
                process.exitCode = 1
            }
            printHelp()
            return
        }
        const options = parsed.options
        if (!options) return
        if (options.url) {
            try {
                new URL(options.url)
            } catch {
                console.error('Invalid URL.')
                process.exitCode = 1
                return
            }
        }

        const loaded = await loadMemoConfig()
        const servers = { ...(loaded.config.mcp_servers ?? {}) }
        if (servers[options.name]) {
            console.error(`MCP server "${options.name}" already exists.`)
            process.exitCode = 1
            return
        }

        let entry: MCPServerConfig
        if (options.url) {
            entry = {
                type: 'streamable_http',
                url: options.url,
                ...(options.bearerTokenEnvVar
                    ? { bearer_token_env_var: options.bearerTokenEnvVar }
                    : {}),
            }
        } else {
            entry = {
                command: options.command!,
                args: options.args && options.args.length > 0 ? options.args : undefined,
                env: options.env,
            }
        }

        servers[options.name] = entry
        await writeMemoConfig(loaded.configPath, {
            ...loaded.config,
            mcp_servers: servers,
        })
        console.log(`Added MCP server "${options.name}".`)
        return
    }

    if (command === 'remove') {
        const name = pickName(rest)
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }
        const loaded = await loadMemoConfig()
        const servers = { ...(loaded.config.mcp_servers ?? {}) }
        if (!servers[name]) {
            console.error(`Unknown MCP server "${name}".`)
            process.exitCode = 1
            return
        }
        delete servers[name]
        await writeMemoConfig(loaded.configPath, {
            ...loaded.config,
            mcp_servers: servers,
        })
        console.log(`Removed MCP server "${name}".`)
        return
    }

    if (command === 'login' || command === 'logout') {
        const name = pickName(rest, ['--scopes'])
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }
        const loaded = await loadMemoConfig()
        const server = loaded.config.mcp_servers?.[name]
        if (!server) {
            console.error(`Unknown MCP server "${name}".`)
            process.exitCode = 1
            return
        }
        if (!('url' in server)) {
            console.error('OAuth login/logout only applies to streamable HTTP servers.')
            process.exitCode = 1
            return
        }
        console.error(
            `OAuth login/logout is not supported in memo yet. Configure a bearer token env var instead.`,
        )
        process.exitCode = 1
        return
    }

    console.error(`Unknown subcommand: ${command}`)
    printHelp()
    process.exitCode = 1
}
