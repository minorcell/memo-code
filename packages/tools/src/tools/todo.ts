import { z } from 'zod'
import type { McpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

// 在进程内维护任务列表，进程退出后清空
type StoredTask = {
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed'
}

const MAX_TASKS = 10
const tasks: StoredTask[] = []

// 为了兼容 OpenAI Function Calling API，使用单一 object schema 而不是 discriminatedUnion
// 因为 API 要求 parameters 必须有 type: "object"
const TODO_INPUT_SCHEMA = z
    .object({
        type: z.enum(['add', 'replace', 'update', 'remove']),
        // add/replace/update 时使用
        todos: z
            .array(
                z.object({
                    content: z
                        .string()
                        .trim()
                        .min(1, 'content 不能为空')
                        .max(200, 'content 最长 200 字符'),
                    status: z
                        .enum(['pending', 'in_progress', 'completed'])
                        .optional()
                        .default('pending'),
                    // update 时需要
                    id: z.string().min(1, 'id 不能为空').optional(),
                }),
            )
            .optional(),
        // remove 时使用
        ids: z.array(z.string().min(1, 'id 不能为空')).optional(),
    })
    .strict()
    .refine(
        (data) => {
            // add/replace/update 必须有 todos
            if (['add', 'replace', 'update'].includes(data.type)) {
                if (!data.todos || data.todos.length === 0) return false
                // update 时每个 todo 必须有 id
                if (data.type === 'update') {
                    return data.todos.every((t) => t.id)
                }
            }
            // remove 必须有 ids
            if (data.type === 'remove') {
                if (!data.ids || data.ids.length === 0) return false
            }
            return true
        },
        {
            message: 'add/replace/update 需要 todos，remove 需要 ids，update 需要 id',
        },
    )

type TodoInput = z.infer<typeof TODO_INPUT_SCHEMA>

function cloneTasks() {
    return tasks.map((t) => ({ ...t }))
}

function mutate(input: TodoInput) {
    switch (input.type) {
        case 'add': {
            const todos = input.todos!
            const remaining = MAX_TASKS - tasks.length
            if (todos.length > remaining) {
                return { error: `任务上限 ${MAX_TASKS}，当前剩余 ${remaining} 条空位` }
            }
            const added = todos.map((t) => ({
                id: crypto.randomUUID(),
                content: t.content,
                status: t.status,
            }))
            tasks.push(...added)
            return { added, tasks: cloneTasks() }
        }
        case 'replace': {
            const todos = input.todos!
            if (todos.length > MAX_TASKS) {
                return { error: `任务上限 ${MAX_TASKS}` }
            }
            tasks.splice(0, tasks.length)
            const replaced = todos.map((t) => ({
                id: crypto.randomUUID(),
                content: t.content,
                status: t.status,
            }))
            tasks.push(...replaced)
            return { replaced: true, tasks: cloneTasks() }
        }
        case 'update': {
            const todos = input.todos!
            const ids = todos.map((t) => t.id!)
            const idSet = new Set(ids)
            if (idSet.size !== ids.length) {
                return { error: '更新列表存在重复 id' }
            }
            const map = new Map(tasks.map((t) => [t.id, t]))
            for (const upd of todos) {
                const found = map.get(upd.id!)
                if (!found) return { error: `未找到任务 id=${upd.id}` }
                found.content = upd.content
                if (upd.status) found.status = upd.status
            }
            return { updated: ids, tasks: cloneTasks() }
        }
        case 'remove': {
            const ids = input.ids!
            const before = tasks.length
            const removeSet = new Set(ids)
            const kept = tasks.filter((t) => !removeSet.has(t.id))
            if (kept.length === before) {
                return { error: '未找到任何可删除的任务 id' }
            }
            tasks.splice(0, tasks.length, ...kept)
            return { removed: ids, tasks: cloneTasks() }
        }
    }
}

/** todo: 进程内待办管理（add/update/remove/replace），最多 10 条，不持久化。 */
export const todoTool: McpTool<TodoInput> = {
    name: 'todo',
    description: '管理待办列表（add/update/remove/replace），最多 10 条，不持久化',
    inputSchema: TODO_INPUT_SCHEMA,
    execute: async (input) => {
        const result = mutate(input)
        if (result.error) return textResult(result.error, true)
        const payload = {
            op: input.type,
            count: tasks.length,
            tasks: result.tasks,
            added: (result as any).added,
            updated: (result as any).updated,
            removed: (result as any).removed,
            replaced: Boolean((result as any).replaced),
        }
        return textResult(JSON.stringify(payload))
    },
}
