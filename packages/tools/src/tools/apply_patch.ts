import { access, readFile, realpath, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { textResult } from '@memo/tools/tools/mcp'
import { normalizePath, writePathDenyReason } from '@memo/tools/tools/helpers'
import { defineMcpTool } from '@memo/tools/tools/types'

const EDIT_ITEM_SCHEMA = z
    .object({
        old_string: z.string().min(1, 'old_string cannot be empty'),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
    })
    .strict()

const APPLY_PATCH_INPUT_SCHEMA = z
    .object({
        file_path: z.string().min(1),
        old_string: z.string().optional(),
        new_string: z.string().optional(),
        replace_all: z.boolean().optional(),
        edits: z.array(EDIT_ITEM_SCHEMA).min(1).optional(),
    })
    .superRefine((value, ctx) => {
        const hasBatch = Boolean(value.edits && value.edits.length > 0)
        const hasSingle =
            value.old_string !== undefined ||
            value.new_string !== undefined ||
            value.replace_all !== undefined

        if (hasBatch && hasSingle) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Use either edits or old_string/new_string fields, not both.',
            })
            return
        }

        if (!hasBatch) {
            if (typeof value.old_string !== 'string' || typeof value.new_string !== 'string') {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Provide old_string/new_string, or use edits.',
                })
                return
            }

            if (!value.old_string.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'old_string cannot be empty',
                    path: ['old_string'],
                })
            }

            return
        }

        for (let i = 0; i < (value.edits?.length ?? 0); i += 1) {
            const item = value.edits?.[i]
            if (!item) continue

            if (!item.old_string.trim()) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'old_string cannot be empty',
                    path: ['edits', i, 'old_string'],
                })
            }
        }
    })
    .strict()

type ApplyPatchInput = z.infer<typeof APPLY_PATCH_INPUT_SCHEMA>
type EditItem = z.infer<typeof EDIT_ITEM_SCHEMA>

function ensureWritable(absPath: string) {
    const reason = writePathDenyReason(absPath)
    if (reason) {
        throw new Error(reason)
    }
}

function toOperations(input: ApplyPatchInput): EditItem[] {
    if (input.edits && input.edits.length > 0) {
        return input.edits
    }

    return [
        {
            old_string: input.old_string ?? '',
            new_string: input.new_string ?? '',
            replace_all: input.replace_all,
        },
    ]
}

export const applyPatchTool = defineMcpTool<ApplyPatchInput>({
    name: 'apply_patch',
    description:
        'Edit a local file by direct string replacement. Supports single replacement fields or batch edits.',
    inputSchema: APPLY_PATCH_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async (input) => {
        const parsed = APPLY_PATCH_INPUT_SCHEMA.safeParse(input)
        if (!parsed.success) {
            const detail = parsed.error.issues[0]?.message ?? 'invalid input'
            return textResult(`apply_patch invalid input: ${detail}`, true)
        }
        const validInput = parsed.data
        const userPath = normalizePath(validInput.file_path)

        try {
            await access(userPath)
            const targetPath = normalizePath(await realpath(userPath))
            ensureWritable(targetPath)

            const original = await readFile(targetPath, 'utf8')
            const operations = toOperations(input)

            let working = original
            let replacementCount = 0

            for (let i = 0; i < operations.length; i += 1) {
                const op = operations[i]
                if (!op) continue

                const oldString = op.old_string
                const replaceAll = op.replace_all ?? false

                if (!working.includes(oldString)) {
                    if (operations.length === 1) {
                        return textResult('apply_patch failed: target text not found.', true)
                    }
                    return textResult(
                        `apply_patch failed: target text not found at edit ${i + 1}.`,
                        true,
                    )
                }

                if (replaceAll) {
                    const parts = working.split(oldString)
                    const count = parts.length - 1
                    working = parts.join(op.new_string)
                    replacementCount += count
                } else {
                    working = working.replace(oldString, op.new_string)
                    replacementCount += 1
                }
            }

            if (working === original) {
                return textResult('No changes made.')
            }

            await writeFile(targetPath, working, 'utf8')
            return textResult(
                `Success. Updated file: ${targetPath}\nEdits: ${operations.length}\nReplacements: ${replacementCount}`,
            )
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code
            if (code === 'ENOENT') {
                return textResult(`apply_patch failed: file does not exist: ${userPath}`, true)
            }
            return textResult(`apply_patch failed: ${(err as Error).message}`, true)
        }
    },
})
