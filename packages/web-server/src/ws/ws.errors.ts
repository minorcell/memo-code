export class WsRpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_NOT_FOUND = 4404;
export const WS_CLOSE_SESSION_OCCUPIED = 4409;
