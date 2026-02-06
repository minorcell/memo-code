import { access, readFile, writeFile } from 'node:fs/promises'
import { normalizePath } from '@memo/tools/tools/helpers'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'
import { z } from 'zod'

const BATCH_EDIT_ITEM_SCHEMA = z
    .object({
        old_string: z.string().min(1, 'old_string 不能为空'),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
    })
    .strict()

const EDIT_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        old_string: z.string().optional(),
        new_string: z.string().optional(),
        replace_all: z.boolean().optional(),
        edits: z.array(BATCH_EDIT_ITEM_SCHEMA).min(1).optional(),
    })
    .superRefine((value, ctx) => {
        const hasBatch = Boolean(value.edits && value.edits.length > 0)
        const hasSingle =
            typeof value.old_string === 'string' || typeof value.new_string === 'string'

        if (hasBatch && hasSingle) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'edits 与 old_string/new_string 不能同时使用',
            })
            return
        }

        if (!hasBatch) {
            if (typeof value.old_string !== 'string' || typeof value.new_string !== 'string') {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: '必须提供 old_string/new_string，或使用 edits',
                })
                return
            }
            if (!value.old_string.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'old_string 不能为空',
                    path: ['old_string'],
                })
            }
        } else {
            for (let i = 0; i < (value.edits?.length ?? 0); i++) {
                const item = value.edits?.[i]
                if (!item) continue
                if (!item.old_string.trim()) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'old_string 不能为空',
                        path: ['edits', i, 'old_string'],
                    })
                }
            }
        }
    })
    .strict()

type EditInput = z.infer<typeof EDIT_INPUT_SCHEMA>

/**
 * 根据入参在目标文件中替换文本，支持单次或全局替换。
 * 返回替换数量及文件路径，若未找到或未变更会返回提示语。
 */
export const editTool: McpTool<EditInput> = {
    name: 'edit',
    description: '在文件中替换文本，支持 replace_all 和批量 edits',
    inputSchema: EDIT_INPUT_SCHEMA,
    execute: async (input) => {
        const path = normalizePath(input.file_path)

        try {
            await access(path)
            const original = await readFile(path, 'utf8')

            const operations =
                input.edits && input.edits.length > 0
                    ? input.edits
                    : [
                          {
                              old_string: input.old_string ?? '',
                              new_string: input.new_string ?? '',
                              replace_all: input.replace_all,
                          },
                      ]

            let working = original
            let totalCount = 0
            for (let i = 0; i < operations.length; i++) {
                const op = operations[i]
                if (!op) continue

                const oldString = op.old_string
                const replaceAll = op.replace_all ?? false
                if (!working.includes(oldString)) {
                    if (operations.length === 1) {
                        return textResult('未找到待替换文本', true)
                    }
                    return textResult(`第 ${i + 1} 处替换未找到待替换文本`, true)
                }

                if (replaceAll) {
                    const parts = working.split(oldString)
                    const count = parts.length - 1
                    working = parts.join(op.new_string)
                    totalCount += count
                } else {
                    working = working.replace(oldString, op.new_string)
                    totalCount += 1
                }
            }

            if (working === original) {
                return textResult('未检测到内容变化')
            }

            await writeFile(path, working, 'utf8')
            return textResult(
                `替换完成: file=${path} edits=${operations.length} count=${totalCount}`,
            )
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code
            if (code === 'ENOENT') {
                return textResult(`文件不存在: ${path}`, true)
            }
            return textResult(`edit 失败: ${(err as Error).message}`, true)
        }
    },
}
