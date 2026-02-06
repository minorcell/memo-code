import { buildSlashHelpLines } from './specs'

const SLASH_LINES = buildSlashHelpLines().join('\n')

export const HELP_TEXT = `Available commands:
${SLASH_LINES}
  exit        Exit the session (no slash)
  $           Execute shell command (e.g. $ git status)

Shortcuts:
  Enter       Send message
  Shift+Enter New line in input
  Up/Down     Browse input history
  Tab         Accept suggestion
  Ctrl+L      Start a new session
  Ctrl+C      Exit
  exit        Type in input to exit
  Esc Esc     Cancel / Clear input`
