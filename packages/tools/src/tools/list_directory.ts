import fs from 'node:fs/promises'
import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { validatePath } from '@memo/tools/tools/filesystem/lib'
import { resolveAllowedDirectories } from '@memo/tools/tools/filesystem/roots'

const LIST_DIRECTORY_INPUT_SCHEMA = z
    .object({
        path: z.string().min(1),
    })
    .strict()

type ListDirectoryInput = z.infer<typeof LIST_DIRECTORY_INPUT_SCHEMA>

export const listDirectoryTool = defineMcpTool<ListDirectoryInput>({
    name: 'list_directory',
    description: 'List direct children of a directory using [DIR]/[FILE] labels.',
    inputSchema: LIST_DIRECTORY_INPUT_SCHEMA,
    supportsParallelToolCalls: true,
    isMutating: false,
    execute: async (input) => {
        try {
            const allowedDirectories = await resolveAllowedDirectories()
            const validPath = await validatePath(input.path, allowedDirectories)
            const entries = await fs.readdir(validPath, { withFileTypes: true })
            const formatted = entries
                .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
                .join('\n')
            return textResult(formatted)
        } catch (err) {
            return textResult(`list_directory failed: ${(err as Error).message}`, true)
        }
    },
})
