/** @file 工具风险分类器 */

import type { RiskLevel } from './types'
import { DEFAULT_TOOL_RISK_LEVELS, RISK_LEVEL_ORDER } from './constants'

export interface ToolClassifier {
    /** 获取工具的风险等级 */
    getRiskLevel(toolName: string): RiskLevel

    /** 比较两个风险等级 */
    compareRisk(a: RiskLevel, b: RiskLevel): number

    /** 检查是否需要审批 */
    needsApproval(riskLevel: RiskLevel, mode: 'auto' | 'strict'): boolean
}

export interface ToolClassifierConfig {
    /** 自定义工具风险等级映射 */
    customLevels?: Record<string, RiskLevel>
}

/** 创建工具风险分类器 */
export function createToolClassifier(config?: ToolClassifierConfig): ToolClassifier {
    const riskLevels: Record<string, RiskLevel> = {
        ...DEFAULT_TOOL_RISK_LEVELS,
        ...config?.customLevels,
    }

    return {
        getRiskLevel(toolName: string): RiskLevel {
            if (toolName in riskLevels) {
                return riskLevels[toolName]!
            }

            const lowerName = toolName.toLowerCase()

            if (
                lowerName.includes('exec') ||
                lowerName.includes('run') ||
                lowerName.includes('shell') ||
                lowerName.includes('command') ||
                lowerName.includes('stdin')
            ) {
                return 'execute'
            }

            if (
                lowerName.includes('write') ||
                lowerName.includes('patch') ||
                lowerName.includes('create') ||
                lowerName.includes('delete') ||
                lowerName.includes('modify') ||
                lowerName.includes('update')
            ) {
                return 'write'
            }

            if (
                lowerName.includes('read') ||
                lowerName.includes('get') ||
                lowerName.includes('fetch') ||
                lowerName.includes('search') ||
                lowerName.includes('list') ||
                lowerName.includes('find')
            ) {
                return 'read'
            }

            return 'write'
        },

        compareRisk(a: RiskLevel, b: RiskLevel): number {
            return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b]
        },

        needsApproval(riskLevel: RiskLevel, mode: 'auto' | 'strict'): boolean {
            if (mode === 'strict') {
                return true
            }

            return riskLevel === 'write' || riskLevel === 'execute'
        },
    }
}
