import { z } from 'zod'
import { defineMcpTool } from '@memo/tools/tools/types'
import { textResult } from '@memo/tools/tools/mcp'

type AgentStatus = 'running' | 'closed'

type AgentRecord = {
    id: string
    createdAt: string
    lastMessage: string
    status: AgentStatus
}

const agents = new Map<string, AgentRecord>()

const SPAWN_AGENT_INPUT_SCHEMA = z
    .object({
        message: z.string().min(1),
        agent_type: z.string().optional(),
    })
    .strict()

const SEND_INPUT_INPUT_SCHEMA = z
    .object({
        id: z.string().min(1),
        message: z.string().min(1),
        interrupt: z.boolean().optional(),
    })
    .strict()

const RESUME_AGENT_INPUT_SCHEMA = z
    .object({
        id: z.string().min(1),
    })
    .strict()

const WAIT_INPUT_SCHEMA = z
    .object({
        ids: z.array(z.string().min(1)).min(1),
        timeout_ms: z.number().int().positive().optional(),
    })
    .strict()

const CLOSE_AGENT_INPUT_SCHEMA = z
    .object({
        id: z.string().min(1),
    })
    .strict()

type SpawnInput = z.infer<typeof SPAWN_AGENT_INPUT_SCHEMA>
type SendInput = z.infer<typeof SEND_INPUT_INPUT_SCHEMA>
type ResumeInput = z.infer<typeof RESUME_AGENT_INPUT_SCHEMA>
type WaitInput = z.infer<typeof WAIT_INPUT_SCHEMA>
type CloseInput = z.infer<typeof CLOSE_AGENT_INPUT_SCHEMA>

function buildMissingAgentError(id: string) {
    return textResult(`agent not found: ${id}`, true)
}

export const spawnAgentTool = defineMcpTool<SpawnInput>({
    name: 'spawn_agent',
    description: 'Spawn a sub-agent for a well-scoped task and return the agent id.',
    inputSchema: SPAWN_AGENT_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async ({ message }) => {
        const id = crypto.randomUUID()
        const record: AgentRecord = {
            id,
            createdAt: new Date().toISOString(),
            lastMessage: message,
            status: 'running',
        }
        agents.set(id, record)
        return textResult(JSON.stringify(record, null, 2))
    },
})

export const sendInputTool = defineMcpTool<SendInput>({
    name: 'send_input',
    description: 'Send a message to an existing agent.',
    inputSchema: SEND_INPUT_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async ({ id, message }) => {
        const record = agents.get(id)
        if (!record) return buildMissingAgentError(id)
        record.lastMessage = message
        return textResult(JSON.stringify(record, null, 2))
    },
})

export const resumeAgentTool = defineMcpTool<ResumeInput>({
    name: 'resume_agent',
    description: 'Resume a previously closed agent by id.',
    inputSchema: RESUME_AGENT_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async ({ id }) => {
        const record = agents.get(id)
        if (!record) return buildMissingAgentError(id)
        record.status = 'running'
        return textResult(JSON.stringify(record, null, 2))
    },
})

export const waitTool = defineMcpTool<WaitInput>({
    name: 'wait',
    description: 'Wait for agent statuses and return current snapshots.',
    inputSchema: WAIT_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: false,
    execute: async ({ ids }) => {
        const statuses = ids.map((id) => {
            const record = agents.get(id)
            return {
                id,
                status: record?.status ?? 'closed',
                lastMessage: record?.lastMessage ?? '',
            }
        })
        return textResult(JSON.stringify({ statuses }, null, 2))
    },
})

export const closeAgentTool = defineMcpTool<CloseInput>({
    name: 'close_agent',
    description: 'Close an agent and return its last known status.',
    inputSchema: CLOSE_AGENT_INPUT_SCHEMA,
    supportsParallelToolCalls: false,
    isMutating: true,
    execute: async ({ id }) => {
        const record = agents.get(id)
        if (!record) return buildMissingAgentError(id)
        record.status = 'closed'
        return textResult(JSON.stringify(record, null, 2))
    },
})
