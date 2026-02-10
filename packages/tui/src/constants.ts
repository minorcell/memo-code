export const CONTEXT_LIMIT_CHOICES = [80000, 120000, 150000, 200000] as const
export type ContextLimitChoice = (typeof CONTEXT_LIMIT_CHOICES)[number]

export const DEFAULT_CONTEXT_LIMIT: ContextLimitChoice = CONTEXT_LIMIT_CHOICES[1]

export const SLASH_COMMANDS = {
    HELP: 'help',
    EXIT: 'exit',
    NEW: 'new',
    RESUME: 'resume',
    MODELS: 'models',
    CONTEXT: 'context',
    MCP: 'mcp',
    INIT: 'init',
} as const

export type SlashCommandName = (typeof SLASH_COMMANDS)[keyof typeof SLASH_COMMANDS]

export function formatSlashCommand(command: SlashCommandName): string {
    return `/${command}`
}

export const PLAIN_EXIT_COMMAND = 'exit' as const
