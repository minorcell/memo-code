import type { ProviderConfig } from '@memo/core/config/config'

export type SlashResolveContext = {
    configPath: string
    providerName: string
    model: string
    mcpServerNames: string[]
    providers: ProviderConfig[]
    contextLimit: number
}

export type SlashCommandResult =
    | { kind: 'exit' }
    | { kind: 'new' }
    | { kind: 'message'; title: string; content: string }
    | { kind: 'switch_model'; provider: ProviderConfig }
    | { kind: 'set_context_limit'; limit: number }

const HELP_TEXT = `Available commands:
  /help       Show help and shortcuts
  /exit       Exit the session
  /new        Start a new session
  /models     Pick a model from config
  /history    Show session history
  /context    Show or set context length (e.g. /context 120k)

Shortcuts:
  Enter       Send message
  Shift+Enter New line in input
  Up/Down     Browse input history
  Ctrl+L      Start a new session
  Ctrl+C      Exit
  Ctrl+X      Toggle mode
  Ctrl+/      Show help`

export function resolveSlashCommand(raw: string, context: SlashResolveContext): SlashCommandResult {
    const [command, ...rest] = raw.trim().slice(1).split(/\s+/)
    const CONTEXT_CHOICES = [80000, 120000, 150000, 200000] as const

    const parseContextLimit = (input: string | undefined): number | null => {
        if (!input) return null
        const normalized = input.toLowerCase().replace(/,/g, '')
        const match = normalized.match(/^(\d+)(k)?$/)
        if (!match) return null
        const value = Number(match[1]) * (match[2] ? 1000 : 1)
        return Number.isFinite(value) ? value : null
    }

    switch (command) {
        case 'exit':
            return { kind: 'exit' }
        case 'new':
            return { kind: 'new' }
        case 'help':
            return {
                kind: 'message',
                title: 'Help',
                content: HELP_TEXT,
            }
        case 'config':
            return {
                kind: 'message',
                title: 'Config',
                content: `Config file: ${context.configPath}\nCurrent provider: ${context.providerName}\nCurrent model: ${context.model}`,
            }
        case 'history':
            return {
                kind: 'message',
                title: 'History',
                content: 'Type "history" to filter and select from session history.',
            }
        case 'context': {
            const candidate = parseContextLimit(rest[0])
            const options = CONTEXT_CHOICES.map((n) => `${n / 1000}k`).join(', ')
            if (candidate === null) {
                return {
                    kind: 'message',
                    title: 'Context',
                    content: `Current: ${(context.contextLimit / 1000).toFixed(0)}k\nUsage: /context <length>\nChoices: ${options}`,
                }
            }
            if (!CONTEXT_CHOICES.includes(candidate as (typeof CONTEXT_CHOICES)[number])) {
                return {
                    kind: 'message',
                    title: 'Context',
                    content: `Unsupported length: ${candidate}. Pick one of: ${options}`,
                }
            }
            return { kind: 'set_context_limit', limit: candidate }
        }
        case 'models': {
            if (!context.providers.length) {
                return {
                    kind: 'message',
                    title: 'Models',
                    content: `No providers configured. Check ${context.configPath}`,
                }
            }
            const query = rest.join(' ').trim()
            const found =
                context.providers.find((p) => p.name === query) ??
                context.providers.find((p) => p.model === query)
            if (found) {
                return { kind: 'switch_model', provider: found }
            }
            const lines = context.providers.map((p) => {
                const baseUrl = p.base_url ? ` @ ${p.base_url}` : ''
                return `- ${p.name}: ${p.model}${baseUrl}`
            })
            const hint = query ? `Not found: ${query}, ` : ''
            return {
                kind: 'message',
                title: 'Models',
                content: `${hint}Available models:\n${lines.join('\n')}`,
            }
        }
        default:
            return {
                kind: 'message',
                title: 'Unknown',
                content: `Unknown command: ${raw}\nType /help for available commands.`,
            }
    }
}
