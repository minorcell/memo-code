import type { SlashCommand } from './types'
import { newCommand } from './new'
import { exitCommand } from './exit'
import { historyCommand } from './history'
import { modelsCommand } from './models'
import { helpCommand } from './help'
import { contextCommand } from './context'

export const SLASH_COMMANDS: SlashCommand[] = [
    helpCommand,
    exitCommand,
    newCommand,
    historyCommand,
    modelsCommand,
    contextCommand,
]

export type { SlashCommand, SlashCommandContext } from './types'
