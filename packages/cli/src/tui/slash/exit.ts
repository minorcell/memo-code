import type { SlashCommand } from './types'

export const exitCommand: SlashCommand = {
    name: 'exit',
    description: 'Exit the session',
    run: ({ closeSuggestions, exitApp }) => {
        closeSuggestions()
        exitApp()
    },
}
