import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'

export const initCommand: SlashCommand = {
    name: 'init',
    description: getSlashDescription('init'),
    run: ({ closeSuggestions, setInputValue }) => {
        closeSuggestions(false)
        setInputValue('/init')
    },
}
