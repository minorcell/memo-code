import type { SlashCommand } from './types'

export const resumeCommand: SlashCommand = {
    name: 'resume',
    description: '恢复历史输入',
    run: ({ closeSuggestions, setInputValue, showSystemMessage }) => {
        closeSuggestions(false)
        setInputValue('resume ')
        showSystemMessage(
            'Resume',
            'Type "resume" followed by keywords to filter and select from session history.',
        )
    },
}
