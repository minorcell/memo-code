/** @file Approval manager implementation */

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
import { ALWAYS_AUTO_APPROVE_TOOLS } from './constants'

interface ApprovalCache {
    session: Set<ApprovalKey>
    once: Set<ApprovalKey>
    denied: Set<ApprovalKey>
}

function buildApprovalReason(toolName: string): string {
    return `Tool "${toolName}" requires approval.`
}

export function createApprovalManager(config?: ApprovalManagerConfig): ApprovalManager {
    const { mode = 'auto', dangerous = false, toolRiskLevels } = config || {}
    const approvalMode = mode === 'strict' ? 'strict' : 'auto'

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
            if (ALWAYS_AUTO_APPROVE_TOOLS.has(toolName)) {
                return { needApproval: false, decision: 'auto-execute' }
            }

            const riskLevel = classifier.getRiskLevel(toolName)

            if (!classifier.needsApproval(riskLevel, approvalMode)) {
                return { needApproval: false, decision: 'auto-execute' }
            }

            const fingerprint = generateFingerprint(toolName, params)

            if (cache.session.has(fingerprint) || cache.once.has(fingerprint)) {
                return { needApproval: false, decision: 'auto-execute' }
            }

            if (cache.denied.has(fingerprint)) {
                return {
                    needApproval: true,
                    fingerprint,
                    riskLevel,
                    reason: 'This request was previously denied.',
                    toolName,
                    params,
                }
            }

            return {
                needApproval: true,
                fingerprint,
                riskLevel,
                reason: buildApprovalReason(toolName),
                toolName,
                params,
            }
        },

        recordDecision(fingerprint: ApprovalKey, decision: ApprovalDecision): void {
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
