import type { IncomingMessage } from 'node:http';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AccessTokenPayload } from '../auth/auth.types';

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

function matchSessionStreamPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/chat\/sessions\/([^/]+)\/stream$/);
  if (!match) return null;
  const sessionId = match[1]?.trim();
  return sessionId && sessionId.length > 0
    ? decodeURIComponent(sessionId)
    : null;
}

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

@Injectable()
export class StreamService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamService.name);
  private readonly socketsBySession = new Map<string, Set<WebSocket>>();
  private readonly listenersBySession = new Map<
    string,
    Set<(payload: unknown) => void>
  >();
  private readonly globalListeners = new Set<
    (sessionId: string, payload: unknown) => void
  >();
  private wsServer: WebSocketServer | null = null;
  private attached = false;

  attach(options: AttachOptions): void {
    if (this.attached) return;
    this.attached = true;

    this.wsServer = new WebSocketServer({ noServer: true });

    options.httpServer.on('upgrade', (request, socket, head) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const sessionId = matchSessionStreamPath(requestUrl.pathname);
      if (!sessionId || !this.wsServer) return;

      const queryToken =
        requestUrl.searchParams.get('accessToken')?.trim() ?? null;
      const headerToken = readBearerTokenFromHeader(
        request.headers.authorization,
      );
      const accessToken = headerToken ?? queryToken;

      if (!accessToken) {
        socket.write('HTTP/1.1 401 Unauthorized\\r\\n\\r\\n');
        socket.destroy();
        return;
      }

      void options
        .verifyAccessToken(accessToken)
        .then(() => {
          this.wsServer?.handleUpgrade(request, socket, head, (ws) => {
            this.registerSocket(sessionId, ws);
          });
        })
        .catch(() => {
          socket.write('HTTP/1.1 401 Unauthorized\\r\\n\\r\\n');
          socket.destroy();
        });
    });
  }

  broadcast(sessionId: string, payload: unknown): void {
    if (this.globalListeners.size > 0) {
      for (const listener of this.globalListeners) {
        listener(sessionId, payload);
      }
    }

    const listeners = this.listenersBySession.get(sessionId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        listener(payload);
      }
    }

    const sockets = this.socketsBySession.get(sessionId);
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  disconnectSession(sessionId: string): void {
    const sockets = this.socketsBySession.get(sessionId);
    if (!sockets) return;
    for (const socket of sockets) {
      socket.close(1000, 'session closed');
    }
    this.socketsBySession.delete(sessionId);
  }

  subscribe(
    sessionId: string,
    listener: (payload: unknown) => void,
  ): () => void {
    let listeners = this.listenersBySession.get(sessionId);
    if (!listeners) {
      listeners = new Set<(payload: unknown) => void>();
      this.listenersBySession.set(sessionId, listeners);
    }
    listeners.add(listener);

    return () => {
      const target = this.listenersBySession.get(sessionId);
      if (!target) return;
      target.delete(listener);
      if (target.size === 0) {
        this.listenersBySession.delete(sessionId);
      }
    };
  }

  subscribeAll(
    listener: (sessionId: string, payload: unknown) => void,
  ): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.wsServer) {
      for (const [, sockets] of this.socketsBySession) {
        for (const socket of sockets) {
          socket.close(1001, 'server shutdown');
        }
      }
      this.socketsBySession.clear();
      this.listenersBySession.clear();
      this.globalListeners.clear();
      await new Promise<void>((resolve) => {
        this.wsServer?.close(() => resolve());
      });
      this.wsServer = null;
    }
  }

  private registerSocket(sessionId: string, socket: WebSocket): void {
    let sockets = this.socketsBySession.get(sessionId);
    if (!sockets) {
      sockets = new Set<WebSocket>();
      this.socketsBySession.set(sessionId, sockets);
    }
    sockets.add(socket);

    socket.on('close', () => {
      const target = this.socketsBySession.get(sessionId);
      if (!target) return;
      target.delete(socket);
      if (target.size === 0) {
        this.socketsBySession.delete(sessionId);
      }
    });

    socket.on('error', (error) => {
      this.logger.warn(
        `socket error for session=${sessionId}: ${error.message}`,
      );
    });
  }
}
