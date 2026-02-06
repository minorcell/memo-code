import assert from 'node:assert'
import { describe, test } from 'vitest'
import { createToolClassifier } from './classifier'

describe('tool classifier', () => {
    test('classifies save_memory as write risk', () => {
        const classifier = createToolClassifier()
        assert.strictEqual(classifier.getRiskLevel('save_memory'), 'write')
        assert.strictEqual(classifier.needsApproval('write', 'auto'), true)
    })
})
