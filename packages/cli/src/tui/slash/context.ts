import type { SlashCommand } from './types'

export const contextCommand: SlashCommand = {
    name: 'context',
    description: 'Set context length limit (80k/120k/150k/200k)',
    run: ({ closeSuggestions, setInputValue }) => {
        closeSuggestions(false)
        setInputValue('/context ')
    },
}
