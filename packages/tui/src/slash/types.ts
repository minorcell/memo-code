import type { ProviderConfig, MCPServerConfig } from '@memo/core'
import type { ToolPermissionMode } from '../constants'

export type SlashContext = {
    configPath: string
    providerName: string
    model: string
    mcpServers: Record<string, MCPServerConfig>
    providers: ProviderConfig[]
    contextLimit: number
    toolPermissionMode: ToolPermissionMode
}

export type SlashCommandResult =
    | { kind: 'exit' }
    | { kind: 'new' }
    | { kind: 'message'; title: string; content: string }
    | { kind: 'review_pr'; prNumber: number }
    | { kind: 'switch_model'; provider: ProviderConfig }
    | { kind: 'set_context_limit'; limit: number }
    | { kind: 'set_tool_permission'; mode: ToolPermissionMode }
    | { kind: 'init_agents_md' }

export type SlashSpec = {
    name: string
    description: string
}
