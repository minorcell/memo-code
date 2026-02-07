/** @file 工具审批系统常量 */

import type { RiskLevel } from './types'

/** 内置工具的风险等级映射 */
export const DEFAULT_TOOL_RISK_LEVELS: Record<string, RiskLevel> = {
    // 只读工具 - 无需审批
    list_mcp_resources: 'read',
    list_mcp_resource_templates: 'read',
    read_mcp_resource: 'read',
    update_plan: 'read',
    get_memory: 'read',
    webfetch: 'read',
    read_file: 'read',
    list_dir: 'read',
    grep_files: 'read',
    wait: 'read',

    // 写入工具 - 需要审批
    apply_patch: 'write',

    // 执行工具 - 最高风险，需要审批
    shell: 'execute',
    shell_command: 'execute',
    exec_command: 'execute',
    write_stdin: 'execute',
    spawn_agent: 'execute',
    send_input: 'execute',
    resume_agent: 'execute',
    close_agent: 'execute',
}

/** 风险等级描述 */
export const RISK_LEVEL_DESCRIPTIONS: Record<RiskLevel, string> = {
    read: '只读操作',
    write: '写入操作',
    execute: '执行操作',
}

/** 风险等级排序（用于比较） */
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
    read: 0,
    write: 1,
    execute: 2,
}

/** 审批理由模板 */
export const APPROVAL_REASONS: Record<RiskLevel, (toolName: string) => string> = {
    read: (tool) => `${tool} 将读取文件或数据`,
    write: (tool) => `${tool} 将修改或创建文件`,
    execute: (tool) => `${tool} 将执行系统命令`,
}
