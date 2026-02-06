import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'

export const exitCommand: SlashCommand = {
    name: 'exit',
    description: getSlashDescription('exit'),
    run: ({ closeSuggestions, exitApp }) => {
        closeSuggestions()
        exitApp()
    },
}
