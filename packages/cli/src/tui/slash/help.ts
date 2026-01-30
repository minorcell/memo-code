import type { SlashCommand } from './types'

export const helpCommand: SlashCommand = {
    name: 'help',
    description: '显示帮助信息',
    run: ({ closeSuggestions, setInputValue }) => {
        closeSuggestions()
        // Help is shown as a system message, input remains
        setInputValue('')
    },
}
