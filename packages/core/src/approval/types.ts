/** @file 工具审批系统类型定义 */

/** 工具风险等级 */
export type RiskLevel = 'read' | 'write' | 'execute'

/** 用户审批决策 */
export type ApprovalDecision = 'once' | 'session' | 'deny'

/** 审批模式 */
export type ApprovalMode = 'dangerous' | 'auto' | 'strict'

/** 授权缓存键（指纹） */
export type ApprovalKey = string

/** 审批检查结果 */
export type ApprovalCheckResult =
    | { needApproval: false; decision: 'auto-execute' }
    | {
          needApproval: true
          fingerprint: ApprovalKey
          riskLevel: RiskLevel
          reason: string
          toolName: string
          params: unknown
      }

/** 审批请求（用于 UI 展示） */
export interface ApprovalRequest {
    toolName: string
    params: unknown
    fingerprint: ApprovalKey
    riskLevel: RiskLevel
    reason: string
}

/** 审批管理器配置 */
export interface ApprovalManagerConfig {
    /** 审批模式 */
    mode?: ApprovalMode
    /** 是否危险模式（绕过所有审批） */
    dangerous?: boolean
    /** 自定义工具风险等级映射 */
    toolRiskLevels?: Record<string, RiskLevel>
}

/** 审批管理器接口 */
export interface ApprovalManager {
    /** 是否危险模式 */
    readonly isDangerousMode: boolean

    /** 获取工具的风险等级 */
    getRiskLevel(toolName: string): RiskLevel

    /** 检查工具调用是否需要审批 */
    check(toolName: string, params: unknown): ApprovalCheckResult

    /** 记录用户决策 */
    recordDecision(fingerprint: ApprovalKey, decision: ApprovalDecision): void

    /** 检查某个指纹是否已被授权 */
    isGranted(fingerprint: ApprovalKey): boolean

    /** 清除单次授权（Turn 结束时调用） */
    clearOnceApprovals(): void

    /** 清除所有授权（Session 结束时调用） */
    dispose(): void
}
