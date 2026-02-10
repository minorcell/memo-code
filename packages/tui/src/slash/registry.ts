import type { SlashCommandResult, SlashContext, SlashSpec } from './types'
import {
    CONTEXT_LIMIT_CHOICES,
    formatSlashCommand,
    SLASH_COMMANDS,
    type ContextLimitChoice,
} from '../constants'

export const SLASH_SPECS: SlashSpec[] = [
    { name: SLASH_COMMANDS.HELP, description: 'Show command and shortcut help' },
    { name: SLASH_COMMANDS.EXIT, description: 'Exit current session' },
    { name: SLASH_COMMANDS.NEW, description: 'Start a fresh session' },
    { name: SLASH_COMMANDS.RESUME, description: 'List and load session history' },
    { name: SLASH_COMMANDS.MODELS, description: 'List or switch configured models' },
    {
        name: SLASH_COMMANDS.CONTEXT,
        description: 'Set context window (80k/120k/150k/200k)',
    },
    { name: SLASH_COMMANDS.MCP, description: 'Show configured MCP servers' },
    { name: SLASH_COMMANDS.INIT, description: 'Generate AGENTS.md with agent instructions' },
]

export function buildHelpText(): string {
    const maxName = SLASH_SPECS.reduce((max, item) => Math.max(max, item.name.length), 0)
    const commandLines = SLASH_SPECS.map(
        (item) => `  ${formatSlashCommand(item.name).padEnd(maxName + 3)}  ${item.description}`,
    )

    return [
        'Available commands:',
        ...commandLines,
        '  exit        Exit session (without slash)',
        '',
        'Shortcuts:',
        '  Enter       Send message',
        '  Shift+Enter New line',
        '  Up/Down     Browse local input history',
        '  Tab         Accept active suggestion',
        '  Ctrl+L      Clear screen and start new session',
        '  Esc Esc     Interrupt running turn / clear input',
    ].join('\n')
}

function parseContextLimit(input: string | undefined): number | null {
    if (!input) return null
    const normalized = input.toLowerCase().replace(/,/g, '')
    const match = normalized.match(/^(\d+)(k)?$/)
    if (!match) return null
    const base = Number(match[1])
    if (!Number.isFinite(base)) return null
    return base * (match[2] ? 1000 : 1)
}

export function resolveSlashCommand(raw: string, context: SlashContext): SlashCommandResult {
    const [commandRaw, ...rest] = raw.trim().slice(1).split(/\s+/)
    const command = (commandRaw ?? '').toLowerCase()

    switch (command) {
        case SLASH_COMMANDS.HELP:
            return { kind: 'message', title: 'Help', content: buildHelpText() }

        case SLASH_COMMANDS.EXIT:
            return { kind: 'exit' }

        case SLASH_COMMANDS.NEW:
            return { kind: 'new' }

        case SLASH_COMMANDS.RESUME:
            return {
                kind: 'message',
                title: 'Resume',
                content: 'Type "resume" followed by keywords to load local session history.',
            }

        case SLASH_COMMANDS.MODELS: {
            if (!context.providers.length) {
                return {
                    kind: 'message',
                    title: 'Models',
                    content: `No providers configured. Check ${context.configPath}`,
                }
            }

            const query = rest.join(' ').trim()
            const found =
                context.providers.find((provider) => provider.name === query) ??
                context.providers.find((provider) => provider.model === query)

            if (found) {
                return { kind: 'switch_model', provider: found }
            }

            const lines = context.providers.map((provider) => {
                const marker =
                    provider.name === context.providerName && provider.model === context.model
                        ? ' (current)'
                        : ''
                const base = provider.base_url ? ` @ ${provider.base_url}` : ''
                return `- ${provider.name}: ${provider.model}${base}${marker}`
            })

            const prefix = query ? `Not found: ${query}\n\n` : ''
            return {
                kind: 'message',
                title: 'Models',
                content: `${prefix}${lines.join('\n')}`,
            }
        }

        case SLASH_COMMANDS.CONTEXT: {
            const parsed = parseContextLimit(rest[0])
            const options = CONTEXT_LIMIT_CHOICES.map(
                (value) => `${Math.floor(value / 1000)}k`,
            ).join(', ')

            if (parsed === null) {
                return {
                    kind: 'message',
                    title: 'Context',
                    content: `Current: ${(context.contextLimit / 1000).toFixed(0)}k\nUsage: ${formatSlashCommand(SLASH_COMMANDS.CONTEXT)} <length>\nChoices: ${options}`,
                }
            }

            if (!CONTEXT_LIMIT_CHOICES.includes(parsed as ContextLimitChoice)) {
                return {
                    kind: 'message',
                    title: 'Context',
                    content: `Unsupported value: ${parsed}. Choose one of ${options}`,
                }
            }

            return {
                kind: 'set_context_limit',
                limit: parsed,
            }
        }

        case SLASH_COMMANDS.MCP: {
            const names = Object.keys(context.mcpServers)
            if (!names.length) {
                return {
                    kind: 'message',
                    title: 'MCP Servers',
                    content: 'No MCP servers configured in current config.',
                }
            }

            const lines: string[] = []
            lines.push(`Total: ${names.length}`)
            lines.push('')

            for (const [name, server] of Object.entries(context.mcpServers)) {
                lines.push(`- ${name}`)
                if ('url' in server) {
                    lines.push(`  type: ${server.type ?? 'streamable_http'}`)
                    lines.push(`  url: ${server.url}`)
                    if (server.bearer_token_env_var) {
                        lines.push(`  bearer: ${server.bearer_token_env_var}`)
                    }
                } else {
                    lines.push(`  type: ${server.type ?? 'stdio'}`)
                    lines.push(`  command: ${server.command}`)
                    if (server.args?.length) {
                        lines.push(`  args: ${server.args.join(' ')}`)
                    }
                }
                lines.push('')
            }

            return {
                kind: 'message',
                title: 'MCP Servers',
                content: lines.join('\n'),
            }
        }

        case SLASH_COMMANDS.INIT:
            return { kind: 'init_agents_md' }

        default:
            return {
                kind: 'message',
                title: 'Unknown',
                content: `Unknown command: ${raw}\nType ${formatSlashCommand(SLASH_COMMANDS.HELP)} for available commands.`,
            }
    }
}
