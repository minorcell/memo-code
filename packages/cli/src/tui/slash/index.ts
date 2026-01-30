import type { SlashCommand } from './types'
import { clearCommand } from './clear'
import { exitCommand } from './exit'
import { historyCommand } from './history'
import { modelsCommand } from './models'
import { helpCommand } from './help'
import { contextCommand } from './context'

export const SLASH_COMMANDS: SlashCommand[] = [
    helpCommand,
    exitCommand,
    clearCommand,
    historyCommand,
    modelsCommand,
    contextCommand,
]

export type { SlashCommand, SlashCommandContext } from './types'
