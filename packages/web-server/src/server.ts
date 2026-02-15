import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { ServerConfigService } from './config/server-config.service';
import { StreamService } from './stream/stream.service';
import { WsGatewayService } from './ws/ws-gateway.service';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5494;
const BUILTIN_ALLOWED_CORS_HOSTS = ['*.ngrok-free.app'];

export type StartMemoWebServerOptions = {
  host?: string;
  port?: number;
  staticDir?: string;
};

export type StartedMemoWebServer = {
  app: NestExpressApplication;
  host: string;
  port: number;
  staticDir: string | null;
  configPath: string;
  url: string;
  close: () => Promise<void>;
};

function parsePort(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  if (Number.isInteger(value) && value > 0 && value <= 65535) return value;
  return fallback;
}

function allowCorsOrigin(
  origin: string | undefined,
  allowedHosts: string[],
): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname) return false;

    const normalizedAllowedHosts = allowedHosts
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    return normalizedAllowedHosts.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern === hostname) return true;

      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return hostname.endsWith(suffix);
      }

      if (pattern.startsWith('.')) {
        return hostname === pattern.slice(1) || hostname.endsWith(pattern);
      }

      return false;
    });
  } catch {
    return false;
  }
}

function normalizeHost(value: string | undefined): string {
  if (!value) return DEFAULT_HOST;
  const trimmed = value.trim();
  return trimmed || DEFAULT_HOST;
}

function resolveStaticDir(staticDir: string | undefined): string | null {
  if (!staticDir) return null;
  const resolved = resolve(staticDir);
  const indexPath = join(resolved, 'index.html');
  if (!existsSync(indexPath)) return null;
  return resolved;
}

function setupStaticHosting(
  app: NestExpressApplication,
  staticDir: string | null,
  logger: Logger,
): void {
  if (!staticDir) {
    logger.warn(
      'web-ui static directory is not configured or missing index.html',
    );
    return;
  }

  app.useStaticAssets(staticDir, { index: false });
  const expressApp = app.getHttpAdapter().getInstance() as {
    get: (
      path: string | RegExp,
      handler: (req: Request, res: Response) => void,
    ) => void;
  };

  const indexPath = join(staticDir, 'index.html');
  expressApp.get(/^\/(?!api(?:\/|$)|healthz$).*/, (_req, res) => {
    res.sendFile(indexPath);
  });
  logger.log(`Serving web-ui static files from ${staticDir}`);
}

export async function startMemoWebServer(
  options: StartMemoWebServerOptions = {},
): Promise<StartedMemoWebServer> {
  const logger = new Logger('WebServer');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ServerConfigService);
  const config = await configService.load();
  const effectiveAllowedCorsHosts = Array.from(
    new Set([
      ...config.security.corsAllowedHosts,
      ...BUILTIN_ALLOWED_CORS_HOSTS,
    ]),
  );

  const corsOptions: CorsOptions = {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (allowCorsOrigin(origin, effectiveAllowedCorsHosts)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin is not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  };
  app.enableCors(corsOptions);

  const host = normalizeHost(options.host);
  const port = parsePort(options.port, DEFAULT_PORT);
  const staticDir = resolveStaticDir(options.staticDir);
  setupStaticHosting(app, staticDir, logger);
  const streamService = app.get(StreamService);
  const wsGatewayService = app.get(WsGatewayService);
  const authService = app.get(AuthService);
  streamService.attach({
    httpServer: app.getHttpServer(),
    verifyAccessToken: (token) => authService.verifyAccessToken(token),
  });
  wsGatewayService.attach({
    httpServer: app.getHttpServer(),
    verifyAccessToken: (token) => authService.verifyAccessToken(token),
  });

  await app.listen(port, host);
  const url = `http://${host}:${port}`;
  logger.log(`Memo web-server started at ${url}`);
  logger.log(`Using auth config: ${configService.getConfigPath()}`);
  logger.log(`Allowed CORS hosts: ${effectiveAllowedCorsHosts.join(', ')}`);

  return {
    app,
    host,
    port,
    staticDir,
    configPath: configService.getConfigPath(),
    url,
    close: async () => {
      await app.close();
    },
  };
}

export function defaultMemoWebHost(): string {
  return DEFAULT_HOST;
}

export function defaultMemoWebPort(): number {
  return DEFAULT_PORT;
}
