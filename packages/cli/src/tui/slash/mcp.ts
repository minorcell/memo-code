import type { SlashCommand } from './types'
import type { MCPServerConfig } from '@memo/core'

function formatServerConfig(name: string, config: MCPServerConfig): string {
    const lines: string[] = []
    lines.push(`- **${name}**`)

    if ('url' in config) {
        // HTTP 类型 (streamable_http 或 sse)
        lines.push(`  - Type: ${config.type ?? 'streamable_http'}`)
        lines.push(`  - URL: ${config.url}`)
        if (config.type !== 'sse' && config.fallback_to_sse !== undefined) {
            lines.push(`  - Fallback to SSE: ${config.fallback_to_sse}`)
        }
        if (config.headers && Object.keys(config.headers).length > 0) {
            const headerStr = Object.entries(config.headers)
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
    }

    return lines.join('\n')
}

export const mcpCommand: SlashCommand = {
    name: 'mcp',
    description: '查看当前配置的 MCP servers',
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
