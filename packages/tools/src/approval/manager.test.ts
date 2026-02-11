import assert from 'node:assert'
import { describe, test } from 'vitest'
import { createApprovalManager } from './manager'

function assertNeedApproval(
    result: ReturnType<ReturnType<typeof createApprovalManager>['check']>,
) {
    assert.strictEqual(result.needApproval, true)
    if (!result.needApproval) {
        throw new Error('Expected approval to be required')
    }
    return result
}

describe('approval manager', () => {
    test('reuses session approval for the same tool across different params', () => {
        const manager = createApprovalManager({ mode: 'auto' })

        const first = assertNeedApproval(
            manager.check('apply_patch', {
                input: '*** Begin Patch\n*** End Patch\n',
            }),
        )
        manager.recordDecision(first.fingerprint, 'session')

        const second = manager.check('apply_patch', {
            input: '*** Begin Patch\n*** Add File: a.txt\n+hello\n*** End Patch\n',
        })
        assert.strictEqual(second.needApproval, false)

        const third = manager.check('exec_command', { cmd: 'echo hi' })
        assert.strictEqual(third.needApproval, true)
    })

    test('applies once approval by tool until once approvals are cleared', () => {
        const manager = createApprovalManager({ mode: 'auto' })

        const first = assertNeedApproval(
            manager.check('apply_patch', {
                input: '*** Begin Patch\n*** End Patch\n',
            }),
        )
        manager.recordDecision(first.fingerprint, 'once')

        const second = manager.check('apply_patch', {
            input: '*** Begin Patch\n*** Add File: b.txt\n+hello\n*** End Patch\n',
        })
        assert.strictEqual(second.needApproval, false)

        manager.clearOnceApprovals()

        const third = manager.check('apply_patch', {
            input: '*** Begin Patch\n*** Add File: c.txt\n+hello\n*** End Patch\n',
        })
        assert.strictEqual(third.needApproval, true)
    })

    test('tracks deny decisions by tool', () => {
        const manager = createApprovalManager({ mode: 'auto' })

        const first = assertNeedApproval(
            manager.check('apply_patch', {
                input: '*** Begin Patch\n*** End Patch\n',
            }),
        )
        manager.recordDecision(first.fingerprint, 'deny')

        const second = assertNeedApproval(
            manager.check('apply_patch', {
                input: '*** Begin Patch\n*** Add File: d.txt\n+hello\n*** End Patch\n',
            }),
        )
        assert.strictEqual(second.reason, 'This request was previously denied.')

        const third = assertNeedApproval(
            manager.check('exec_command', { cmd: 'echo hi' }),
        )
        assert.strictEqual(third.reason, 'Tool "exec_command" requires approval.')
    })
})
