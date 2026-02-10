/** @file History event definition and JSONL Sink implementation. */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { HistoryEvent, HistorySink, Role } from '@memo/core/types'

/** JSONL history writer: one event per line. */
export class JsonlHistorySink implements HistorySink {
    private ready = false

    constructor(private filePath: string) {}

    async append(event: HistoryEvent) {
        if (!this.ready) {
            await mkdir(dirname(this.filePath), { recursive: true })
            this.ready = true
        }
        await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8')
    }

    async flush() {
        // appendFile already ensures persistence, here only for interface compatibility
        return Promise.resolve()
    }
}

/** Helper to generate structured history events. */
export function createHistoryEvent(params: {
    sessionId: string
    type: HistoryEvent['type']
    turn?: number
    step?: number
    content?: string
    role?: Role
    meta?: Record<string, unknown>
}): HistoryEvent {
    return {
        ts: new Date().toISOString(),
        sessionId: params.sessionId,
        turn: params.turn,
        step: params.step,
        type: params.type,
        content: params.content,
        role: params.role,
        meta: params.meta,
    }
}
