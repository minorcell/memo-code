import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { REQUEST_ID_HEADER } from '../constants';

function readHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first && first.length > 0 ? first : null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const existingRequestId = readHeaderValue(
      request.headers[REQUEST_ID_HEADER],
    );
    const requestId = existingRequestId ?? randomUUID();
    const startedAt = Date.now();

    request.requestId = requestId;
    response.locals.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms reqId=${requestId}`,
      );
    });

    next();
  }
}
