import type { ProviderConfig, MCPServerConfig } from '@memo/core'

export type SlashContext = {
    configPath: string
    providerName: string
    model: string
    mcpServers: Record<string, MCPServerConfig>
    providers: ProviderConfig[]
    contextLimit: number
}

export type SlashCommandResult =
    | { kind: 'exit' }
    | { kind: 'new' }
    | { kind: 'message'; title: string; content: string }
    | { kind: 'switch_model'; provider: ProviderConfig }
    | { kind: 'set_context_limit'; limit: number }
    | { kind: 'init_agents_md' }

export type SlashSpec = {
    name: string
    description: string
}
