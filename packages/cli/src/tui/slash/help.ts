import type { SlashCommand } from './types'

const HELP_TEXT = `Available commands:
  /help       Show help and shortcuts
  /exit       Exit the session
  exit        Exit the session (no slash)
  /new        Start a new session
  /models     Pick a model from config
  /history    Show session history
  /context    Show or set context length (e.g. /context 120k)
  /mcp        Show configured MCP servers
  /init       Generate AGENTS.md for current project

Shortcuts:
  Enter       Send message
  Shift+Enter New line in input
  Up/Down     Browse input history
  Tab         Accept suggestion
  Ctrl+L      Start a new session
  Ctrl+C      Exit
  exit        Type in input to exit
  Esc Esc     Cancel / Clear input`

export const helpCommand: SlashCommand = {
    name: 'help',
    description: '显示帮助信息',
    run: ({ closeSuggestions, setInputValue, showSystemMessage }) => {
        closeSuggestions()
        setInputValue('')
        showSystemMessage('Help', HELP_TEXT)
    },
}
