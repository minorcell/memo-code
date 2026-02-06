export const SLASH_COMMAND_SPECS = [
    { name: 'help', description: 'Show help and shortcuts' },
    { name: 'exit', description: 'Exit the session' },
    { name: 'new', description: 'Start a new session' },
    { name: 'resume', description: 'Resume session history' },
    { name: 'models', description: 'Select a model (from configured providers)' },
    {
        name: 'context',
        description: 'Set context length limit (80k/120k/150k/200k) (starts new session)',
    },
    { name: 'mcp', description: 'Show configured MCP servers' },
    { name: 'init', description: 'Generate AGENTS.md for current project' },
] as const

export type SlashCommandName = (typeof SLASH_COMMAND_SPECS)[number]['name']

const DESCRIPTION_MAP = Object.fromEntries(
    SLASH_COMMAND_SPECS.map((spec) => [spec.name, spec.description]),
) as Record<SlashCommandName, string>

export function getSlashDescription(name: SlashCommandName): string {
    return DESCRIPTION_MAP[name]
}

export function buildSlashHelpLines(): string[] {
    const maxName = SLASH_COMMAND_SPECS.reduce((max, spec) => Math.max(max, spec.name.length), 0)
    return SLASH_COMMAND_SPECS.map((spec) => `  /${spec.name.padEnd(maxName)}  ${spec.description}`)
}
