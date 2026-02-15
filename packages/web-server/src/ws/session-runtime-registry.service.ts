import { Injectable } from '@nestjs/common';
import { WsRpcError } from './ws.errors';

type RuntimeRecord = {
  ownerConnectionId: string;
  runtimeHandle?: unknown;
  historyFilePath?: string;
  workspaceId?: string;
  status?: 'idle' | 'running' | 'closed';
  updatedAt?: string;
};

@Injectable()
export class SessionRuntimeRegistry {
  private readonly sessionMap = new Map<string, RuntimeRecord>();
  private readonly connectionSessions = new Map<string, Set<string>>();

  claim(sessionId: string, connectionId: string): void {
    const existing = this.sessionMap.get(sessionId);
    if (existing && existing.ownerConnectionId !== connectionId) {
      throw new WsRpcError(
        'SESSION_OCCUPIED',
        `Session ${sessionId} is already attached by another connection.`,
      );
    }

    this.sessionMap.set(sessionId, {
      ownerConnectionId: connectionId,
      runtimeHandle: existing?.runtimeHandle,
      historyFilePath: existing?.historyFilePath,
      workspaceId: existing?.workspaceId,
      status: existing?.status,
      updatedAt: new Date().toISOString(),
    });

    let set = this.connectionSessions.get(connectionId);
    if (!set) {
      set = new Set<string>();
      this.connectionSessions.set(connectionId, set);
    }
    set.add(sessionId);
  }

  release(sessionId: string, connectionId: string): void {
    const record = this.sessionMap.get(sessionId);
    if (!record) return;
    if (record.ownerConnectionId !== connectionId) return;

    this.sessionMap.delete(sessionId);
    const set = this.connectionSessions.get(connectionId);
    if (!set) return;
    set.delete(sessionId);
    if (set.size === 0) {
      this.connectionSessions.delete(connectionId);
    }
  }

  releaseAll(connectionId: string): string[] {
    const set = this.connectionSessions.get(connectionId);
    if (!set || set.size === 0) return [];

    const released = Array.from(set.values());
    for (const sessionId of released) {
      const record = this.sessionMap.get(sessionId);
      if (record && record.ownerConnectionId === connectionId) {
        this.sessionMap.delete(sessionId);
      }
    }
    this.connectionSessions.delete(connectionId);
    return released;
  }

  isOwner(sessionId: string, connectionId: string): boolean {
    const record = this.sessionMap.get(sessionId);
    return record?.ownerConnectionId === connectionId;
  }

  requireOwner(sessionId: string, connectionId: string): void {
    if (!this.isOwner(sessionId, connectionId)) {
      throw new WsRpcError(
        'SESSION_NOT_ATTACHED',
        `Session ${sessionId} is not attached.`,
      );
    }
  }

  setRuntime(sessionId: string, runtimeHandle: unknown): void {
    const record = this.sessionMap.get(sessionId);
    if (!record) return;
    record.runtimeHandle = runtimeHandle;
  }

  setHistoryFilePath(sessionId: string, historyFilePath: string): void {
    const record = this.sessionMap.get(sessionId);
    if (!record) return;
    record.historyFilePath = historyFilePath;
  }

  setWorkspaceId(sessionId: string, workspaceId: string): void {
    const record = this.sessionMap.get(sessionId);
    if (!record) return;
    record.workspaceId = workspaceId;
    record.updatedAt = new Date().toISOString();
  }

  setStatus(sessionId: string, status: 'idle' | 'running' | 'closed'): void {
    const record = this.sessionMap.get(sessionId);
    if (!record) return;
    record.status = status;
    record.updatedAt = new Date().toISOString();
  }

  listAll(): Array<{
    sessionId: string;
    ownerConnectionId: string;
    workspaceId?: string;
    status?: 'idle' | 'running' | 'closed';
    updatedAt?: string;
  }> {
    return Array.from(this.sessionMap.entries()).map(([sessionId, value]) => ({
      sessionId,
      ownerConnectionId: value.ownerConnectionId,
      workspaceId: value.workspaceId,
      status: value.status,
      updatedAt: value.updatedAt,
    }));
  }

  listByWorkspace(workspaceId: string): Array<{
    sessionId: string;
    ownerConnectionId: string;
    workspaceId?: string;
    status?: 'idle' | 'running' | 'closed';
    updatedAt?: string;
  }> {
    return this.listAll().filter((item) => item.workspaceId === workspaceId);
  }

  get(sessionId: string): RuntimeRecord | null {
    return this.sessionMap.get(sessionId) ?? null;
  }
}
