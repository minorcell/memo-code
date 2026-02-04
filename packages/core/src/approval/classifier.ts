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
  // 合并默认配置和自定义配置
  const riskLevels: Record<string, RiskLevel> = {
    ...DEFAULT_TOOL_RISK_LEVELS,
    ...config?.customLevels,
  }

  return {
    getRiskLevel(toolName: string): RiskLevel {
      // 检查内置工具
      if (toolName in riskLevels) {
        return riskLevels[toolName]!
      }

      // MCP 工具：根据名称推断风险等级
      const lowerName = toolName.toLowerCase()

      // 执行类关键词
      if (
        lowerName.includes('exec') ||
        lowerName.includes('run') ||
        lowerName.includes('shell') ||
        lowerName.includes('bash') ||
        lowerName.includes('command')
      ) {
        return 'execute'
      }

      // 写入类关键词
      if (
        lowerName.includes('write') ||
        lowerName.includes('edit') ||
        lowerName.includes('create') ||
        lowerName.includes('delete') ||
        lowerName.includes('modify') ||
        lowerName.includes('update')
      ) {
        return 'write'
      }

      // 只读类关键词
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

      // 默认保守策略：未知工具视为写入级别
      return 'write'
    },

    compareRisk(a: RiskLevel, b: RiskLevel): number {
      return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b]
    },

    needsApproval(riskLevel: RiskLevel, mode: 'auto' | 'strict'): boolean {
      if (mode === 'strict') {
        // 严格模式：所有工具都需要审批
        return true
      }

      // 自动模式：只有写入和执行需要审批
      return riskLevel === 'write' || riskLevel === 'execute'
    },
  }
}
