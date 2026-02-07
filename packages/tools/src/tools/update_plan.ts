import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

const PLAN_ITEM_SCHEMA = z
    .object({
        step: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed']),
    })
    .strict()

const UPDATE_PLAN_INPUT_SCHEMA = z
    .object({
        explanation: z.string().optional(),
        plan: z.array(PLAN_ITEM_SCHEMA).min(1),
    })
    .strict()

type UpdatePlanInput = z.infer<typeof UPDATE_PLAN_INPUT_SCHEMA>

let currentPlan: UpdatePlanInput['plan'] = []

export const updatePlanTool = defineMcpTool<UpdatePlanInput>({
    name: 'update_plan',
    description: 'Updates the task plan. At most one step can be in_progress at a time.',
    inputSchema: UPDATE_PLAN_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: false,
    execute: async ({ explanation, plan }) => {
        const inProgressCount = plan.filter((item) => item.status === 'in_progress').length
        if (inProgressCount > 1) {
            return textResult('At most one step can be in_progress at a time', true)
        }

        currentPlan = plan

        return textResult(
            JSON.stringify(
                {
                    message: 'Plan updated',
                    explanation,
                    plan: currentPlan,
                },
                null,
                2,
            ),
        )
    },
})
