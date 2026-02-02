import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const SAVE_MEMORY_INPUT_SCHEMA = z
    .object({
        fact: z
            .string()
            .min(1, 'fact cannot be empty')
            .max(120, 'Please keep facts concise (≤120 characters)')
            .describe(
                'User-related identity traits or preferences, e.g., "User prefers Chinese responses", "User is a frontend engineer". Do not store project-specific technical details.',
            ),
    })
    .strict()

type SaveMemoryInput = z.infer<typeof SAVE_MEMORY_INPUT_SCHEMA>

function resolveMemoryPath() {
    const base = process.env.MEMO_HOME?.trim() || join(homedir(), '.memo')
    return join(base, 'Agents.md')
}

function sanitizeFact(fact: string) {
    return fact.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatContent(header: string, items: string[]) {
    const trimmedItems = items.map((item) => item.trim()).filter(Boolean)
    const lines = trimmedItems.map((item) => `- ${item}`)
    return `${header}\n\n${lines.join('\n')}\n`
}

/**
 * Appends user-related identity traits/preferences to ~/.memo/Agents.md ("Memo Added Memories" section)
 * for injection into system prompts in subsequent sessions.
 *
 * Note: Only stores user-related information (language habits, identity traits, etc.),
 * not project-specific content.
 */
export const saveMemoryTool: McpTool<SaveMemoryInput> = {
    name: 'save_memory',
    description:
        'Save user-related identity traits or preferences (e.g., language habits, tech preferences) for cross-session reuse. Do not save project-specific technical details or file structures.',
    inputSchema: SAVE_MEMORY_INPUT_SCHEMA,
    execute: async (input) => {
        const fact = sanitizeFact(input.fact)
        if (!fact) {
            return textResult('fact cannot be empty', true)
        }
        const memoryPath = resolveMemoryPath()
        const dir = dirname(memoryPath)
        try {
            await mkdir(dir, { recursive: true })
            const header = '## Memo Added Memories'

            try {
                const existing = await (async () => {
                    try {
                        await access(memoryPath)
                        return await readFile(memoryPath, 'utf-8')
                    } catch {
                        return ''
                    }
                })()
                const [, body = ''] = existing.split(header)
                const existingLines = body
                    .split(/\r?\n/)
                    .filter((l) => l.trim().startsWith('- '))
                    .map((l) => l.replace(/^-+\s*/, '').trim())

                existingLines.push(fact)
                const pruned = existingLines.slice(Math.max(0, existingLines.length - 50))
                const finalContent = formatContent(header, pruned)
                await writeFile(memoryPath, finalContent, 'utf-8')
            } catch (err) {
                console.warn(`Memory maintenance failed: ${(err as Error).message}`)
            }

            return textResult(`Memory saved to: ${memoryPath}`)
        } catch (err) {
            return textResult(`Failed to write memory: ${(err as Error).message}`, true)
        }
    },
}
