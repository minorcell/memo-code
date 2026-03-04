import { TOOL_PERMISSION_MODES, type ToolPermissionMode } from '../constants'

export { TOOL_PERMISSION_MODES }
export type { ToolPermissionMode }

export type SlashProvider = {
    name: string
    model: string
    base_url?: string
}

export type McpServerConfig =
    | {
          type?: 'streamable_http'
          url: string
          bearer_token_env_var?: string
      }
    | {
          type?: 'stdio'
          command: string
          args?: string[]
      }

export type SlashContext = {
    configPath: string
    providerName: string
    model: string
    mcpServers: Record<string, McpServerConfig>
    providers: SlashProvider[]
    toolPermissionMode: ToolPermissionMode
}

export type SlashCommandResult =
    | { kind: 'exit' }
    | { kind: 'new' }
    | { kind: 'message'; title: string; content: string }
    | { kind: 'review_pr'; prNumber: number }
    | { kind: 'switch_model'; provider: SlashProvider }
    | { kind: 'set_tool_permission'; mode: ToolPermissionMode }
    | { kind: 'compact' }
    | { kind: 'init_agents_md' }

export type SlashSpec = {
    name: string
    description: string
}
