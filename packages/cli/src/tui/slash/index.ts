import type { SlashCommand } from './types'
import { newCommand } from './new'
import { exitCommand } from './exit'
import { resumeCommand } from './history'
import { modelsCommand } from './models'
import { helpCommand } from './help'
import { contextCommand } from './context'
import { mcpCommand } from './mcp'
import { initCommand } from './init'

export const SLASH_COMMANDS: SlashCommand[] = [
    helpCommand,
    exitCommand,
    newCommand,
    resumeCommand,
    modelsCommand,
    contextCommand,
    mcpCommand,
    initCommand,
]

export type { SlashCommand, SlashCommandContext } from './types'
