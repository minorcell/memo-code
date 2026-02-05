import type { SlashCommand } from './types'
import { getSlashDescription } from './specs'

export const resumeCommand: SlashCommand = {
    name: 'resume',
    description: getSlashDescription('resume'),
    run: ({ closeSuggestions, setInputValue, showSystemMessage }) => {
        closeSuggestions(false)
        setInputValue('resume ')
        showSystemMessage(
            'Resume',
            'Type "resume" followed by keywords to filter and select from session history.',
        )
    },
}
