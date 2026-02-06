import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'

export const contextCommand: SlashCommand = {
    name: 'context',
    description: getSlashDescription('context'),
    run: ({ closeSuggestions, setInputValue }) => {
        closeSuggestions(false)
        setInputValue('/context ')
    },
}
