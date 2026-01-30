import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const SAVE_MEMORY_INPUT_SCHEMA = z
    .object({
        fact: z.string().min(1, 'fact 不能为空').max(120, '请尽量简短事实（≤120 字符）'),
    })
    .strict()

type SaveMemoryInput = z.infer<typeof SAVE_MEMORY_INPUT_SCHEMA>

function resolveMemoryPath() {
    const base = process.env.MEMO_HOME?.trim() || join(homedir(), '.memo')
    // 需求：改为写入 Agents.md
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
 * 将简短事实/偏好追加到 ~/.memo/memo.md（“Memo Added Memories”分节），供后续会话注入系统提示词。
 */
export const saveMemoryTool: McpTool<SaveMemoryInput> = {
    name: 'save_memory',
    description: '保存一条简短事实/偏好，跨会话复用（写入 ~/.memo/memo.md）',
    inputSchema: SAVE_MEMORY_INPUT_SCHEMA,
    execute: async (input) => {
        const fact = sanitizeFact(input.fact)
        if (!fact) {
            return textResult('fact 不能为空', true)
        }
        const memoryPath = resolveMemoryPath()
        const dir = dirname(memoryPath)
        try {
            await mkdir(dir, { recursive: true })
            const header = '## Memo Added Memories'

            try {
                const file = Bun.file(memoryPath)
                const existing = (await file.exists()) ? await file.text() : ''
                const [, body = ''] = existing.split(header)
                const existingLines = body
                    .split(/\r?\n/)
                    .filter((l) => l.trim().startsWith('- '))
                    .map((l) => l.replace(/^-+\s*/, '').trim())

                existingLines.push(fact)
                const pruned = existingLines.slice(Math.max(0, existingLines.length - 50))
                const finalContent = formatContent(header, pruned)
                await Bun.write(memoryPath, finalContent)
            } catch (err) {
                console.warn(`memory 维护失败: ${(err as Error).message}`)
            }

            return textResult(`已保存记忆到: ${memoryPath}`)
        } catch (err) {
            return textResult(`写入 memory 失败: ${(err as Error).message}`, true)
        }
    },
}
