import type { WebSocket } from 'ws';

export type RpcRequestFrame = {
  id: string;
  type: 'rpc.request';
  method: string;
  params?: unknown;
};

export type RpcResponseFrame =
  | {
      id: string;
      type: 'rpc.response';
      ok: true;
      data: unknown;
    }
  | {
      id: string;
      type: 'rpc.response';
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export type RpcEventFrame = {
  type: 'event';
  topic: string;
  data: unknown;
  seq: number;
  ts: string;
};

export type WsConnectionContext = {
  id: string;
  socket: WebSocket;
  username: string;
};
