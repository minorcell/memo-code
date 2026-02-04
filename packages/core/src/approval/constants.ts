/** @file 工具审批系统常量 */

import type { RiskLevel } from './types'

/** 内置工具的风险等级映射 */
export const DEFAULT_TOOL_RISK_LEVELS: Record<string, RiskLevel> = {
    // 只读工具 - 无需审批
    read: 'read',
    glob: 'read',
    grep: 'read',
    webfetch: 'read',
    todo: 'read',

    // 写入工具 - 需要审批
    write: 'write',
    edit: 'write',
    save_memory: 'write',

    // 执行工具 - 最高风险，需要审批
    bash: 'execute',
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
