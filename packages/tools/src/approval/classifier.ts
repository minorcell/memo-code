/** @file 工具风险分类器 */

import type { RiskLevel } from './types'
import {
    AUTO_MODE_APPROVAL_RISKS,
    DEFAULT_TOOL_RISK_LEVELS,
    EXECUTE_RISK_KEYWORDS,
    READ_RISK_KEYWORDS,
    RISK_LEVEL_ORDER,
    WRITE_RISK_KEYWORDS,
} from './constants'

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

            if (matchesAnyKeyword(lowerName, EXECUTE_RISK_KEYWORDS)) {
                return 'execute'
            }

            if (matchesAnyKeyword(lowerName, WRITE_RISK_KEYWORDS)) {
                return 'write'
            }

            if (matchesAnyKeyword(lowerName, READ_RISK_KEYWORDS)) {
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

            return AUTO_MODE_APPROVAL_RISKS.has(riskLevel)
        },
    }
}

function matchesAnyKeyword(name: string, keywords: readonly string[]): boolean {
    return keywords.some((keyword) => name.includes(keyword))
}
