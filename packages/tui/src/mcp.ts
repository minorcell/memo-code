import type { MCPServerConfig } from './http/api_types'
import { withSharedCoreServerClient } from './http/shared_core_client'

type McpCommand = 'list' | 'get' | 'add' | 'remove' | 'login' | 'logout' | 'help'
type McpAuthStatus = 'unsupported' | 'not_logged_in' | 'bearer_token' | 'oauth'

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

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error)
}

export function parseEnvAssignment(raw: string): { key: string; value: string } | null {
    const index = raw.indexOf('=')
    if (index <= 0) return null
    const key = raw.slice(0, index).trim()
    const value = raw.slice(index + 1)
    if (!key) return null
    return { key, value }
}

function formatServer(name: string, config: MCPServerConfig, authStatus?: McpAuthStatus): string {
    const lines: string[] = []
    lines.push(`${name}`)
    if (authStatus) {
        lines.push(`  auth_status: ${authStatus}`)
    }
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

function parseScopes(raw: string): string[] {
    return raw
        .split(/[,\s]+/g)
        .map((scope) => scope.trim())
        .filter(Boolean)
}

function parseLoginArgs(rest: string[]): {
    name?: string
    scopes?: string[]
    error?: string
    showHelp?: boolean
} {
    let name: string | undefined
    let scopes: string[] | undefined

    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i]
        if (!arg) continue
        if (arg === '--help' || arg === '-h') {
            return { showHelp: true }
        }
        if (arg === '--scopes') {
            const next = rest[i + 1]
            if (!next) {
                return { error: 'Missing value for --scopes.' }
            }
            const parsedScopes = parseScopes(next)
            if (parsedScopes.length === 0) {
                return { error: 'Invalid --scopes value. Use comma-separated scopes.' }
            }
            scopes = parsedScopes
            i += 1
            continue
        }
        if (arg.startsWith('--')) {
            return { error: `Unknown option: ${arg}` }
        }
        if (!name) {
            name = arg
            continue
        }
        return { error: `Unexpected argument: ${arg}` }
    }

    return { name, scopes }
}

export async function runMcpCommand(args: string[]): Promise<void> {
    const { command, rest } = parseCommand(args)

    if (command === 'help') {
        printHelp()
        return
    }

    if (command === 'list') {
        const json = rest.includes('--json')
        try {
            const response = await withSharedCoreServerClient((client) => client.listMcpServers())
            const items = [...response.items].sort((left, right) =>
                left.name.localeCompare(right.name),
            )

            if (json) {
                const withAuthStatus: Record<
                    string,
                    MCPServerConfig & { auth_status: McpAuthStatus }
                > = {}
                for (const item of items) {
                    withAuthStatus[item.name] = {
                        ...(item.config as MCPServerConfig),
                        auth_status: item.authStatus,
                    }
                }
                console.log(JSON.stringify(withAuthStatus, null, 2))
                return
            }

            if (items.length === 0) {
                console.log('No MCP servers configured. Add one with "memo mcp add".')
                return
            }

            console.log(`MCP servers (${items.length}):`)
            for (const item of items) {
                console.log(
                    formatServer(item.name, item.config as MCPServerConfig, item.authStatus),
                )
            }
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
    }

    if (command === 'get') {
        const json = rest.includes('--json')
        const name = pickName(rest)
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }

        try {
            const item = await withSharedCoreServerClient((client) => client.getMcpServer(name))
            if (json) {
                console.log(JSON.stringify(item.config, null, 2))
                return
            }
            console.log(formatServer(item.name, item.config as MCPServerConfig, item.authStatus))
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
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

        let config: MCPServerConfig
        if (options.url) {
            config = {
                type: 'streamable_http',
                url: options.url,
                ...(options.bearerTokenEnvVar
                    ? { bearer_token_env_var: options.bearerTokenEnvVar }
                    : {}),
            }
        } else {
            config = {
                command: options.command!,
                args: options.args && options.args.length > 0 ? options.args : undefined,
                env: options.env,
            }
        }

        try {
            await withSharedCoreServerClient((client) =>
                client.createMcpServer(options.name, config),
            )
            console.log(`Added MCP server "${options.name}".`)
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
    }

    if (command === 'remove') {
        const name = pickName(rest)
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }

        try {
            await withSharedCoreServerClient((client) => client.removeMcpServer(name))
            console.log(`Removed MCP server "${name}".`)
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
    }

    if (command === 'login') {
        const parsed = parseLoginArgs(rest)
        if (parsed.showHelp) {
            printHelp()
            return
        }
        if (parsed.error) {
            console.error(parsed.error)
            process.exitCode = 1
            return
        }
        const name = parsed.name
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }

        try {
            await withSharedCoreServerClient((client) => client.loginMcpServer(name, parsed.scopes))
            console.log(`OAuth login completed for "${name}".`)
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
    }

    if (command === 'logout') {
        const name = pickName(rest)
        if (!name) {
            console.error('Missing server name.')
            process.exitCode = 1
            return
        }

        try {
            await withSharedCoreServerClient((client) => client.logoutMcpServer(name))
            console.log(`Removed OAuth credentials for "${name}".`)
            return
        } catch (error) {
            console.error(getErrorMessage(error))
            process.exitCode = 1
            return
        }
    }

    console.error(`Unknown subcommand: ${command}`)
    printHelp()
    process.exitCode = 1
}
