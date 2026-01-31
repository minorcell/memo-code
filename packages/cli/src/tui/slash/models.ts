import type { SlashCommand } from './types'

export const modelsCommand: SlashCommand = {
    name: 'models',
    description: '选择模型（展示配置里的 providers）',
    run: ({ closeSuggestions, setInputValue, showSystemMessage, data }) => {
        closeSuggestions(false)

        const { providers, providerName, model } = data

        if (!providers.length) {
            showSystemMessage('Models', `No providers configured. Check ${data.configPath}`)
            setInputValue('')
            return
        }

        const lines = providers.map((p) => {
            const marker = p.name === providerName && p.model === model ? ' (current)' : ''
            const baseUrl = p.base_url ? ` @ ${p.base_url}` : ''
            return `- ${p.name}: ${p.model}${baseUrl}${marker}`
        })

        setInputValue('/models ')
        showSystemMessage('Models', `Available models:\n${lines.join('\n')}`)
    },
}
