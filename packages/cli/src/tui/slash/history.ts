import type { SlashCommand } from './types'

export const historyCommand: SlashCommand = {
    name: 'history',
    description: '查看历史输入',
    run: ({ closeSuggestions, setInputValue, showSystemMessage }) => {
        closeSuggestions(false)
        setInputValue('history ')
        showSystemMessage(
            'History',
            'Type "history" followed by keywords to filter and select from session history.',
        )
    },
}
