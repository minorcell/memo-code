import type { ProviderConfig } from '@memo/core/config/config'

export type SlashResolveContext = {
    configPath: string
    providerName: string
    model: string
    mcpServerNames: string[]
    providers: ProviderConfig[]
}

export type SlashCommandResult =
    | { kind: 'exit' }
    | { kind: 'clear' }
    | { kind: 'message'; title: string; content: string }
    | { kind: 'switch_model'; provider: ProviderConfig }

const HELP_TEXT = `Available commands:
  /help       Show help and shortcuts
  /exit       Exit the session
  /clear      Clear the screen
  /models     Pick a model from config
  /history    Show session history

Shortcuts:
  Enter       Send message
  Shift+Enter New line in input
  Up/Down     Browse input history
  Ctrl+L      Clear screen
  Ctrl+C      Exit
  Ctrl+X      Toggle mode
  Ctrl+/      Show help`

export function resolveSlashCommand(raw: string, context: SlashResolveContext): SlashCommandResult {
    const [command, ...rest] = raw.trim().slice(1).split(/\s+/)
    switch (command) {
        case 'exit':
            return { kind: 'exit' }
        case 'clear':
            return { kind: 'clear' }
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
