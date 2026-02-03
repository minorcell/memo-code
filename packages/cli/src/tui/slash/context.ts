import type { SlashCommand } from './types'

export const contextCommand: SlashCommand = {
    name: 'context',
    description: 'Set context length limit (80k/120k/150k/200k)',
    run: ({ closeSuggestions, setInputValue, showSystemMessage, data }) => {
        closeSuggestions()
        const options = '80k, 120k, 150k, 200k'
        const current = `Current: ${(data.contextLimit / 1000).toFixed(0)}k`
        setInputValue('/context ')
        showSystemMessage('Context', `${current}\nUsage: /context <length>\nChoices: ${options}`)
    },
}
