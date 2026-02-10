import type { McpTool, ToolName } from '@memo/tools/tools/types'
import { shellTool } from '@memo/tools/tools/shell'
import { shellCommandTool } from '@memo/tools/tools/shell_command'
import { execCommandTool } from '@memo/tools/tools/exec_command'
import { writeStdinTool } from '@memo/tools/tools/write_stdin'
import { applyPatchTool } from '@memo/tools/tools/apply_patch'
import { readFileTool } from '@memo/tools/tools/read_file'
import { listDirTool } from '@memo/tools/tools/list_dir'
import { grepFilesTool } from '@memo/tools/tools/grep_files'
import {
    listMcpResourceTemplatesTool,
    listMcpResourcesTool,
    readMcpResourceTool,
} from '@memo/tools/tools/mcp_resources'
import { updatePlanTool } from '@memo/tools/tools/update_plan'
import { getMemoryTool } from '@memo/tools/tools/get_memory'
import { webfetchTool } from '@memo/tools/tools/webfetch'
import {
    closeAgentTool,
    resumeAgentTool,
    sendInputTool,
    spawnAgentTool,
    waitTool,
} from '@memo/tools/tools/collab'

function parseCsvEnv(name: string): Set<string> {
    const raw = process.env[name]?.trim()
    if (!raw) return new Set()
    return new Set(
        raw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    )
}

function buildCodexTools(): McpTool[] {
    const tools: McpTool[] = []
    const shellMode = process.env.MEMO_SHELL_TOOL_TYPE?.trim() || 'unified_exec'
    const experimental = parseCsvEnv('MEMO_EXPERIMENTAL_TOOLS')
    const enableAllExperimental = experimental.size === 0
    const collabEnabled = process.env.MEMO_ENABLE_COLLAB_TOOLS !== '0'
    const memoryToolEnabled = process.env.MEMO_ENABLE_MEMORY_TOOL !== '0'

    if (shellMode === 'shell') {
        tools.push(shellTool)
    } else if (shellMode === 'shell_command') {
        tools.push(shellCommandTool)
    } else if (shellMode === 'unified_exec') {
        tools.push(execCommandTool, writeStdinTool)
    } else if (shellMode !== 'disabled') {
        tools.push(execCommandTool, writeStdinTool)
    }

    tools.push(listMcpResourcesTool, listMcpResourceTemplatesTool, readMcpResourceTool)
    tools.push(updatePlanTool)
    tools.push(applyPatchTool)

    if (enableAllExperimental || experimental.has('grep_files')) {
        tools.push(grepFilesTool)
    }
    if (enableAllExperimental || experimental.has('read_file')) {
        tools.push(readFileTool)
    }
    if (enableAllExperimental || experimental.has('list_dir')) {
        tools.push(listDirTool)
    }

    if (memoryToolEnabled) {
        tools.push(getMemoryTool)
    }

    tools.push(webfetchTool)

    if (collabEnabled) {
        tools.push(spawnAgentTool, sendInputTool, resumeAgentTool, waitTool, closeAgentTool)
    }

    return tools
}

function indexByName(tools: McpTool[]): Record<ToolName, McpTool> {
    const toolkit: Record<ToolName, McpTool> = {}
    for (const tool of tools) {
        toolkit[tool.name] = tool
    }
    return toolkit
}

/** Exposed tool collection for Agent lookup by tool name. */
export const TOOLKIT: Record<ToolName, McpTool> = indexByName(buildCodexTools())

/** Tool array form, convenient for direct registration to MCP Server etc. */
export const TOOL_LIST: McpTool[] = Object.values(TOOLKIT)

/** Built-in tools (already unified Tool format, no adaptation needed). */
export const NATIVE_TOOLS = TOOL_LIST

export type { McpTool }
export * from '@memo/tools/approval'
export * from '@memo/tools/orchestrator'
export * from '@memo/tools/router'
