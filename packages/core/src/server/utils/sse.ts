import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SseEventEnvelope } from '@memo/core/web/types'

type SseClient = {
    id: string
    res: ServerResponse
}

export class SseHub {
    private readonly clientsBySession = new Map<string, Map<string, SseClient>>()
    private readonly seqBySession = new Map<string, number>()
    private readonly heartbeatTimer: NodeJS.Timeout

    constructor(heartbeatIntervalMs = 20_000) {
        this.heartbeatTimer = setInterval(() => {
            this.heartbeat()
        }, heartbeatIntervalMs)
        this.heartbeatTimer.unref()
    }

    subscribe(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.flushHeaders?.()

        res.write(': connected\n\n')

        const clientId = randomUUID()
        const sessionClients = this.clientsBySession.get(sessionId) ?? new Map<string, SseClient>()
        sessionClients.set(clientId, { id: clientId, res })
        this.clientsBySession.set(sessionId, sessionClients)

        const cleanup = () => {
            this.unsubscribe(sessionId, clientId)
        }

        req.once('close', cleanup)
        req.once('aborted', cleanup)
        res.once('close', cleanup)
        res.once('error', cleanup)
    }

    publish(sessionId: string, event: string, data: unknown): void {
        const clients = this.clientsBySession.get(sessionId)
        if (!clients || clients.size === 0) return

        const envelope = this.buildEnvelope(sessionId, event, data)
        const payload = JSON.stringify(envelope)
        const frame = `id: ${envelope.seq}\nevent: ${event}\ndata: ${payload}\n\n`

        for (const [clientId, client] of clients.entries()) {
            try {
                client.res.write(frame)
            } catch {
                this.unsubscribe(sessionId, clientId)
            }
        }
    }

    closeSession(sessionId: string): void {
        const clients = this.clientsBySession.get(sessionId)
        if (!clients) return

        for (const client of clients.values()) {
            try {
                client.res.end()
            } catch {
                // Ignore socket errors during shutdown.
            }
        }

        this.clientsBySession.delete(sessionId)
        this.seqBySession.delete(sessionId)
    }

    close(): void {
        clearInterval(this.heartbeatTimer)
        for (const sessionId of this.clientsBySession.keys()) {
            this.closeSession(sessionId)
        }
        this.clientsBySession.clear()
        this.seqBySession.clear()
    }

    private unsubscribe(sessionId: string, clientId: string): void {
        const clients = this.clientsBySession.get(sessionId)
        if (!clients) return
        clients.delete(clientId)
        if (clients.size === 0) {
            this.clientsBySession.delete(sessionId)
        }
    }

    private heartbeat(): void {
        for (const [sessionId, clients] of this.clientsBySession.entries()) {
            for (const [clientId, client] of clients.entries()) {
                try {
                    client.res.write(': keep-alive\n\n')
                } catch {
                    this.unsubscribe(sessionId, clientId)
                }
            }
        }
    }

    private buildEnvelope(sessionId: string, event: string, data: unknown): SseEventEnvelope {
        const nextSeq = (this.seqBySession.get(sessionId) ?? 0) + 1
        this.seqBySession.set(sessionId, nextSeq)

        return {
            event,
            data,
            seq: nextSeq,
            ts: new Date().toISOString(),
        }
    }
}
