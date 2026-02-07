import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'
import type { MCPServerConfig } from '@memo/core'

function formatServerConfig(name: string, config: MCPServerConfig): string {
    const lines: string[] = []
    lines.push(`- **${name}**`)

    if ('url' in config) {
        // HTTP 类型 (streamable_http)
        lines.push(`  - Type: ${config.type ?? 'streamable_http'}`)
        lines.push(`  - URL: ${config.url}`)
        if (config.bearer_token_env_var) {
            lines.push(`  - Bearer token env: ${config.bearer_token_env_var}`)
        }
        const headers = config.http_headers ?? config.headers
        if (headers && Object.keys(headers).length > 0) {
            const headerStr = Object.entries(headers)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')
            lines.push(`  - Headers: ${headerStr}`)
        }
    } else {
        // stdio 类型
        lines.push(`  - Type: ${config.type ?? 'stdio'}`)
        lines.push(`  - Command: ${config.command}`)
        if (config.args && config.args.length > 0) {
            lines.push(`  - Args: ${config.args.join(' ')}`)
        }
        if (config.env && Object.keys(config.env).length > 0) {
            const envStr = Object.entries(config.env)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')
            lines.push(`  - Env: ${envStr}`)
        }
    }

    return lines.join('\n')
}

export const mcpCommand: SlashCommand = {
    name: 'mcp',
    description: getSlashDescription('mcp'),
    run: ({ closeSuggestions, setInputValue, showSystemMessage, data }) => {
        closeSuggestions()

        const { mcpServers, configPath } = data
        const serverNames = Object.keys(mcpServers)

        if (serverNames.length === 0) {
            showSystemMessage(
                'MCP Servers',
                `No MCP servers configured.\n\nAdd servers to ${configPath}`,
            )
            setInputValue('')
            return
        }

        const lines: string[] = []
        lines.push(`Total: ${serverNames.length} server(s)\n`)

        for (const [name, config] of Object.entries(mcpServers)) {
            lines.push(formatServerConfig(name, config))
            lines.push('')
        }

        setInputValue('')
        showSystemMessage('MCP Servers', lines.join('\n'))
    },
}
