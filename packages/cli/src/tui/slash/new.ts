import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'

export const newCommand: SlashCommand = {
    name: 'new',
    description: getSlashDescription('new'),
    run: ({ closeSuggestions, setInputValue, clearScreen, showSystemMessage, newSession }) => {
        closeSuggestions()
        setInputValue('')
        clearScreen()
        showSystemMessage('New Session', 'Starting a new session...')
        newSession?.()
    },
}
