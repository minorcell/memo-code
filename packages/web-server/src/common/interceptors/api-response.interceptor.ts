import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { REQUEST_ID_HEADER } from '../constants';

type ApiSuccessMeta = {
  requestId: string;
  timestamp: string;
};

type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta: ApiSuccessMeta;
};

function resolveRequestId(
  request: AuthenticatedRequest,
  response: Response,
): string {
  if (request.requestId && request.requestId.trim().length > 0)
    return request.requestId;
  const fromLocals = (response.locals as { requestId?: unknown } | undefined)
    ?.requestId;
  if (typeof fromLocals === 'string' && fromLocals.trim().length > 0)
    return fromLocals;
  const fromHeader = response.getHeader(REQUEST_ID_HEADER);
  if (typeof fromHeader === 'string' && fromHeader.trim().length > 0)
    return fromHeader;
  return 'unknown';
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessEnvelope<T> | StreamableFile
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessEnvelope<T> | StreamableFile> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<ApiSuccessEnvelope<T>>;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const requestId = resolveRequestId(request, response);

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        return {
          success: true,
          data: (data ?? null) as T,
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
