import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { AccessTokenPayload } from '../auth/auth.types';
import type { ChatSessionSnapshot } from '../chat/chat.types';
import { StreamService } from '../stream/stream.service';
import { RpcRouterService } from './rpc-router.service';
import { SessionRuntimeRegistry } from './session-runtime-registry.service';
import {
  WS_CLOSE_NOT_FOUND,
  WS_CLOSE_SESSION_OCCUPIED,
  WS_CLOSE_UNAUTHORIZED,
  WsRpcError,
} from './ws.errors';
import { WsEventBus } from './ws-event-bus.service';
import type {
  RpcRequestFrame,
  RpcResponseFrame,
  WsConnectionContext,
} from './ws.types';

type AccessTokenVerifier = (token: string) => Promise<AccessTokenPayload>;

type AttachOptions = {
  httpServer: {
    on: (
      event: 'upgrade',
      listener: (
        request: IncomingMessage,
        socket: import('node:net').Socket,
        head: Buffer,
      ) => void,
    ) => void;
  };
  verifyAccessToken: AccessTokenVerifier;
};

type ConnectionState = WsConnectionContext & {
  requestWindow: number[];
  sessionSubscriptions: Map<string, () => void>;
};

type StreamPayload =
  | {
      type: 'turn.start';
      payload: { turn: number; input: string };
    }
  | {
      type: 'assistant.chunk';
      payload: { turn: number; step: number; chunk: string };
    }
  | {
      type: 'turn.final';
      payload: {
        turn: number;
        finalText: string;
        status: string;
        errorMessage?: string;
      };
    }
  | {
      type: 'session.status';
      payload: {
        status: 'idle' | 'running' | 'closed';
        workspaceId?: string;
        updatedAt?: string;
      };
    }
  | {
      type: 'session.snapshot';
      payload: unknown;
    }
  | {
      type: 'system.message';
      payload: {
        title: string;
        content: string;
      };
    }
  | {
      type: 'approval.request';
      payload: {
        fingerprint: string;
        toolName: string;
        reason: string;
        riskLevel: string;
        params: unknown;
      };
    }
  | {
      type: 'tool.action';
      payload: {
        turn: number;
        step: number;
        action: { tool: string; input: unknown };
        parallelActions?: Array<{ tool: string; input: unknown }>;
        thinking?: string;
      };
    }
  | {
      type: 'tool.observation';
      payload: {
        turn: number;
        step: number;
        observation: string;
        resultStatus?: string;
        parallelResultStatuses?: string[];
      };
    }
  | {
      type: 'error';
      payload: {
        code: string;
        message: string;
      };
    };

const WS_PATH = '/api/ws';
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_REQUESTS_PER_MINUTE = 120;
const REQUEST_TIMEOUT_MS = 20_000;

function readBearerTokenFromHeader(
  authorization: string | string[] | undefined,
): string | null {
  if (!authorization) return null;
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!raw) return null;
  const [scheme, token] = raw.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRpcRequest(input: unknown): RpcRequestFrame {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new WsRpcError('BAD_FRAME', 'Invalid frame payload');
  }

  const frame = input as Partial<RpcRequestFrame>;
  if (frame.type !== 'rpc.request') {
    throw new WsRpcError('BAD_FRAME', 'Frame type must be rpc.request');
  }
  if (typeof frame.id !== 'string' || !frame.id.trim()) {
    throw new WsRpcError('BAD_FRAME', 'Frame id is required');
  }
  if (typeof frame.method !== 'string' || !frame.method.trim()) {
    throw new WsRpcError('BAD_FRAME', 'Frame method is required');
  }

  return {
    id: frame.id,
    type: 'rpc.request',
    method: frame.method,
    params: frame.params,
  };
}

function rawByteLength(raw: RawData): number {
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw);
  }
  if (raw instanceof ArrayBuffer) {
    return raw.byteLength;
  }
  if (Array.isArray(raw)) {
    return raw.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  return raw.byteLength;
}

@Injectable()
export class WsGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(WsGatewayService.name);
  private readonly connections = new Map<string, ConnectionState>();
  private wsServer: WebSocketServer | null = null;
  private attached = false;
  private globalStreamUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly rpcRouter: RpcRouterService,
    private readonly streamService: StreamService,
    private readonly sessionRegistry: SessionRuntimeRegistry,
    private readonly eventBus: WsEventBus,
  ) {}

  attach(options: AttachOptions): void {
    if (this.attached) return;
    this.attached = true;

    this.wsServer = new WebSocketServer({ noServer: true });
    this.globalStreamUnsubscribe = this.streamService.subscribeAll(
      (sessionId, payload) => {
        const data = this.mapRuntimeStatusPayload(sessionId, payload);
        if (!data) return;
        this.sessionRegistry.setWorkspaceId(sessionId, data.workspaceId);
        this.sessionRegistry.setStatus(sessionId, data.status);
        this.broadcastEventToAll('chat.runtime.status', data);
      },
    );

    options.httpServer.on('upgrade', (request, socket, head) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== WS_PATH || !this.wsServer) return;

      this.wsServer.handleUpgrade(request, socket, head, (ws) => {
        void this.handleConnection(ws, request, options.verifyAccessToken);
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.wsServer) return;

    if (this.globalStreamUnsubscribe) {
      this.globalStreamUnsubscribe();
      this.globalStreamUnsubscribe = null;
    }

    for (const connection of this.connections.values()) {
      for (const unsubscribe of connection.sessionSubscriptions.values()) {
        unsubscribe();
      }
      connection.sessionSubscriptions.clear();
      connection.socket.close(1001, 'server shutdown');
    }
    this.connections.clear();

    await new Promise<void>((resolve) => {
      this.wsServer?.close(() => resolve());
    });
    this.wsServer = null;
  }

  private async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
    verifyAccessToken: AccessTokenVerifier,
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const queryToken =
      requestUrl.searchParams.get('accessToken')?.trim() ?? null;
    const headerToken = readBearerTokenFromHeader(
      request.headers.authorization,
    );
    const accessToken = headerToken ?? queryToken;

    if (!accessToken) {
      socket.close(WS_CLOSE_UNAUTHORIZED, 'UNAUTHORIZED');
      return;
    }

    let payload: AccessTokenPayload;
    try {
      payload = await verifyAccessToken(accessToken);
    } catch {
      socket.close(WS_CLOSE_UNAUTHORIZED, 'UNAUTHORIZED');
      return;
    }

    const connection: ConnectionState = {
      id: randomUUID(),
      socket,
      username: payload.sub,
      requestWindow: [],
      sessionSubscriptions: new Map<string, () => void>(),
    };

    this.connections.set(connection.id, connection);

    socket.on('message', (raw: RawData) => {
      void this.handleMessage(connection, raw);
    });

    socket.on('close', () => {
      this.cleanupConnection(connection.id);
    });

    socket.on('error', (error) => {
      this.logger.warn(`ws connection error: ${error.message}`);
      this.cleanupConnection(connection.id);
    });
  }

  private async handleMessage(
    connection: ConnectionState,
    raw: RawData,
  ): Promise<void> {
    if (rawByteLength(raw) > MAX_REQUEST_BYTES) {
      connection.socket.close(1009, 'FRAME_TOO_LARGE');
      return;
    }

    const now = Date.now();
    connection.requestWindow = connection.requestWindow.filter(
      (item) => now - item < 60_000,
    );
    connection.requestWindow.push(now);
    if (connection.requestWindow.length > MAX_REQUESTS_PER_MINUTE) {
      this.sendRpcError(
        connection,
        null,
        new WsRpcError(
          'RATE_LIMITED',
          'Too many requests on this websocket connection.',
        ),
      );
      return;
    }

    let parsed: RpcRequestFrame;
    try {
      const payload = JSON.parse(String(raw)) as unknown;
      parsed = asRpcRequest(payload);
    } catch (error) {
      const wsError =
        error instanceof WsRpcError
          ? error
          : new WsRpcError(
              'BAD_FRAME',
              error instanceof Error ? error.message : 'Invalid frame',
            );
      this.sendRpcError(connection, null, wsError);
      return;
    }

    const timer = setTimeout(() => {
      settled = true;
      this.sendRpcError(
        connection,
        parsed.id,
        new WsRpcError('TIMEOUT', `RPC timeout after ${REQUEST_TIMEOUT_MS}ms`),
      );
    }, REQUEST_TIMEOUT_MS);
    let settled = false;

    try {
      const result = await this.rpcRouter.dispatch(
        {
          connectionId: connection.id,
          username: connection.username,
        },
        parsed.method,
        parsed.params,
      );

      if (parsed.method === 'chat.session.attach') {
        const params =
          parsed.params &&
          typeof parsed.params === 'object' &&
          !Array.isArray(parsed.params)
            ? (parsed.params as Record<string, unknown>)
            : {};
        const sessionId =
          typeof params.sessionId === 'string' ? params.sessionId : '';
        if (sessionId) {
          this.bindSession(connection, sessionId);
        }

        const snapshot = result as ChatSessionSnapshot;
        if (snapshot?.state?.workspaceId) {
          this.sessionRegistry.setWorkspaceId(
            sessionId,
            snapshot.state.workspaceId,
          );
        }
        this.sendEvent(connection, 'chat.session.snapshot', {
          sessionId,
          state: snapshot.state,
          turns: snapshot.turns,
        });
      }

      if (
        parsed.method === 'chat.session.close' ||
        parsed.method === 'sessions.remove'
      ) {
        const params =
          parsed.params &&
          typeof parsed.params === 'object' &&
          !Array.isArray(parsed.params)
            ? (parsed.params as Record<string, unknown>)
            : {};
        const sessionId =
          typeof params.sessionId === 'string' ? params.sessionId : '';
        if (sessionId) {
          this.unbindSession(connection, sessionId);
        }
      }

      if (
        parsed.method === 'workspace.add' ||
        parsed.method === 'workspace.update' ||
        parsed.method === 'workspace.remove'
      ) {
        this.broadcastEventToAll('workspace.changed', {
          action: parsed.method,
          payload: result,
        });
      }

      if (settled) return;
      settled = true;
      this.sendRpcSuccess(connection, parsed.id, result);
    } catch (error) {
      if (settled) return;
      settled = true;
      const wsError = this.toWsRpcError(error);
      this.sendRpcError(connection, parsed.id, wsError);
      if (
        parsed.method === 'chat.session.attach' &&
        wsError.code === 'SESSION_OCCUPIED'
      ) {
        connection.socket.close(WS_CLOSE_SESSION_OCCUPIED, 'SESSION_OCCUPIED');
      }
      if (
        parsed.method === 'chat.session.attach' &&
        wsError.code === 'SESSION_NOT_FOUND'
      ) {
        connection.socket.close(WS_CLOSE_NOT_FOUND, 'SESSION_NOT_FOUND');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private bindSession(connection: ConnectionState, sessionId: string): void {
    if (connection.sessionSubscriptions.has(sessionId)) {
      return;
    }

    const unsubscribe = this.streamService.subscribe(sessionId, (payload) => {
      const mapped = this.mapStreamPayload(sessionId, payload);
      if (!mapped) return;
      this.sendEvent(connection, mapped.topic, mapped.data);
    });

    connection.sessionSubscriptions.set(sessionId, unsubscribe);
  }

  private unbindSession(connection: ConnectionState, sessionId: string): void {
    const unsubscribe = connection.sessionSubscriptions.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      connection.sessionSubscriptions.delete(sessionId);
    }
  }

  private cleanupConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const released = this.sessionRegistry.releaseAll(connection.id);
    for (const sessionId of released) {
      this.unbindSession(connection, sessionId);
    }
    for (const sessionId of Array.from(
      connection.sessionSubscriptions.keys(),
    )) {
      this.unbindSession(connection, sessionId);
    }

    this.connections.delete(connectionId);
  }

  private mapStreamPayload(
    sessionId: string,
    payload: unknown,
  ): { topic: string; data: unknown } | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const frame = payload as StreamPayload;

    if (frame.type === 'turn.start') {
      return {
        topic: 'chat.turn.start',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'assistant.chunk') {
      return {
        topic: 'chat.turn.chunk',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'turn.final') {
      return {
        topic: 'chat.turn.final',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'session.status') {
      return {
        topic: 'chat.session.status',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'session.snapshot') {
      return {
        topic: 'chat.session.state',
        data: { sessionId, state: frame.payload },
      };
    }

    if (frame.type === 'system.message') {
      return {
        topic: 'chat.system.message',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'approval.request') {
      return {
        topic: 'chat.approval.request',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'tool.action') {
      return {
        topic: 'chat.tool.action',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'tool.observation') {
      return {
        topic: 'chat.tool.observation',
        data: { sessionId, ...frame.payload },
      };
    }

    if (frame.type === 'error') {
      return {
        topic: 'chat.error',
        data: { sessionId, ...frame.payload },
      };
    }

    return null;
  }

  private mapRuntimeStatusPayload(
    sessionId: string,
    payload: unknown,
  ): {
    sessionId: string;
    status: 'idle' | 'running' | 'closed';
    workspaceId: string;
    updatedAt: string;
  } | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const frame = payload as StreamPayload;
    if (frame.type !== 'session.status') return null;

    const workspaceId = frame.payload.workspaceId;
    const updatedAt = frame.payload.updatedAt;
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) return null;
    if (typeof updatedAt !== 'string' || !updatedAt.trim()) return null;

    return {
      sessionId,
      status: frame.payload.status,
      workspaceId,
      updatedAt,
    };
  }

  private sendRpcSuccess(
    connection: ConnectionState,
    id: string,
    data: unknown,
  ): void {
    const response: RpcResponseFrame = {
      id,
      type: 'rpc.response',
      ok: true,
      data,
    };
    connection.socket.send(JSON.stringify(response));
  }

  private sendRpcError(
    connection: ConnectionState,
    id: string | null,
    error: WsRpcError,
  ): void {
    const response: RpcResponseFrame = {
      id: id ?? randomUUID(),
      type: 'rpc.response',
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
    connection.socket.send(JSON.stringify(response));
  }

  private sendEvent(
    connection: ConnectionState,
    topic: string,
    data: unknown,
  ): void {
    const eventFrame = this.eventBus.create(topic, data);
    connection.socket.send(JSON.stringify(eventFrame));
  }

  private broadcastEventToAll(topic: string, data: unknown): void {
    for (const connection of this.connections.values()) {
      this.sendEvent(connection, topic, data);
    }
  }

  private toWsRpcError(error: unknown): WsRpcError {
    if (error instanceof WsRpcError) {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const message =
        typeof (error as { message?: unknown }).message === 'string'
          ? ((error as { message: string }).message ?? 'Request failed')
          : 'Request failed';

      if (
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('session not found')
      ) {
        return new WsRpcError('SESSION_NOT_FOUND', message);
      }

      return new WsRpcError('RPC_ERROR', message);
    }

    return new WsRpcError('RPC_ERROR', 'Request failed');
  }
}
