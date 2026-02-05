import type { SlashCommand } from './types'
import { HELP_TEXT } from './help_text'
import { getSlashDescription } from './specs'

export const helpCommand: SlashCommand = {
    name: 'help',
    description: getSlashDescription('help'),
    run: ({ closeSuggestions, setInputValue, showSystemMessage }) => {
        closeSuggestions()
        setInputValue('')
        showSystemMessage('Help', HELP_TEXT)
    },
}
