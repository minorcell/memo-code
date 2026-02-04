/** @file 审批管理器实现 */

import type {
  ApprovalManager,
  ApprovalManagerConfig,
  ApprovalKey,
  ApprovalDecision,
  ApprovalCheckResult,
  RiskLevel,
} from './types'
import { createToolClassifier } from './classifier'
import { generateFingerprint } from './fingerprint'
import { APPROVAL_REASONS } from './constants'

interface ApprovalCache {
  /** 会话级授权（整个会话期间有效） */
  session: Set<ApprovalKey>
  /** 单次授权（当前 turn 有效，turn 结束后清除） */
  once: Set<ApprovalKey>
  /** 已拒绝的请求（临时，防止重复询问） */
  denied: Set<ApprovalKey>
}

export function createApprovalManager(config?: ApprovalManagerConfig): ApprovalManager {
  const { mode = 'auto', dangerous = false, toolRiskLevels } = config || {}

  // 危险模式直接返回简化实现
  if (dangerous) {
    return {
      isDangerousMode: true,
      getRiskLevel: () => 'read',
      check: () => ({ needApproval: false, decision: 'auto-execute' }),
      recordDecision: () => {},
      isGranted: () => true,
      clearOnceApprovals: () => {},
      dispose: () => {},
    }
  }

  const classifier = createToolClassifier({ customLevels: toolRiskLevels })

  const cache: ApprovalCache = {
    session: new Set(),
    once: new Set(),
    denied: new Set(),
  }

  return {
    get isDangerousMode() {
      return false
    },

    getRiskLevel(toolName: string): RiskLevel {
      return classifier.getRiskLevel(toolName)
    },

    check(toolName: string, params: unknown): ApprovalCheckResult {
      const riskLevel = classifier.getRiskLevel(toolName)

      // 检查是否需要审批
      if (!classifier.needsApproval(riskLevel, mode)) {
        return { needApproval: false, decision: 'auto-execute' }
      }

      // 生成指纹
      const fingerprint = generateFingerprint(toolName, params)

      // 检查缓存
      if (cache.session.has(fingerprint) || cache.once.has(fingerprint)) {
        return { needApproval: false, decision: 'auto-execute' }
      }

      // 检查是否已被拒绝
      if (cache.denied.has(fingerprint)) {
        return {
          needApproval: true,
          fingerprint,
          riskLevel,
          reason: '该请求已被拒绝',
          toolName,
          params,
        }
      }

      return {
        needApproval: true,
        fingerprint,
        riskLevel,
        reason: APPROVAL_REASONS[riskLevel](toolName),
        toolName,
        params,
      }
    },

    recordDecision(fingerprint: ApprovalKey, decision: ApprovalDecision): void {
      // 清除之前的状态
      cache.session.delete(fingerprint)
      cache.once.delete(fingerprint)
      cache.denied.delete(fingerprint)

      switch (decision) {
        case 'session':
          cache.session.add(fingerprint)
          break
        case 'once':
          cache.once.add(fingerprint)
          break
        case 'deny':
          cache.denied.add(fingerprint)
          break
      }
    },

    isGranted(fingerprint: ApprovalKey): boolean {
      return cache.session.has(fingerprint) || cache.once.has(fingerprint)
    },

    clearOnceApprovals(): void {
      cache.once.clear()
    },

    dispose(): void {
      cache.session.clear()
      cache.once.clear()
      cache.denied.clear()
    },
  }
}
