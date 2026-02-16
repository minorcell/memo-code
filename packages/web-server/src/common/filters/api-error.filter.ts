import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { REQUEST_ID_HEADER } from '../constants';

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const requestId =
      request.requestId ||
      (typeof response.locals?.requestId === 'string'
        ? response.locals.requestId
        : undefined) ||
      (typeof response.getHeader(REQUEST_ID_HEADER) === 'string'
        ? (response.getHeader(REQUEST_ID_HEADER) as string)
        : undefined) ||
      'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: ErrorPayload = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      payload = this.parseHttpException(exception, statusCode);
    } else if (exception instanceof Error) {
      payload = {
        code: 'INTERNAL_SERVER_ERROR',
        message: exception.message || 'Internal server error',
      };
    }

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${statusCode} reqId=${requestId} message="${payload.message}"`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(statusCode).json({
      success: false,
      error: payload,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
      },
    });
  }

  private parseHttpException(
    exception: HttpException,
    statusCode: number,
  ): ErrorPayload {
    const fallbackCode =
      typeof HttpStatus[statusCode] === 'string'
        ? String(HttpStatus[statusCode])
        : 'HTTP_EXCEPTION';
    const fallbackMessage = exception.message || 'Request failed';

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return {
        code: fallbackCode,
        message: response,
      };
    }

    if (!response || typeof response !== 'object') {
      return {
        code: fallbackCode,
        message: fallbackMessage,
      };
    }

    const record = response as Record<string, unknown>;
    const message = this.normalizeMessage(record.message) ?? fallbackMessage;
    const code = typeof record.code === 'string' ? record.code : fallbackCode;
    const details = record.details;
    return {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    };
  }

  private normalizeMessage(raw: unknown): string | null {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) {
      const items = raw.filter(
        (item): item is string => typeof item === 'string',
      );
      if (items.length > 0) return items.join('; ');
    }
    return null;
  }
}
