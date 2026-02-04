import type { SlashCommand } from './types'

export const newCommand: SlashCommand = {
    name: 'new',
    description: 'Start a new session',
    run: ({ closeSuggestions, setInputValue, clearScreen, showSystemMessage, newSession }) => {
        closeSuggestions()
        setInputValue('')
        clearScreen()
        showSystemMessage('New Session', 'Starting a new session...')
        newSession?.()
    },
}
