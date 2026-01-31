import type { SlashCommand } from './types'

export const newCommand: SlashCommand = {
    name: 'new',
    description: '开启一个新对话',
    run: ({ closeSuggestions, setInputValue, clearScreen }) => {
        closeSuggestions()
        setInputValue('')
        clearScreen()
    },
}
