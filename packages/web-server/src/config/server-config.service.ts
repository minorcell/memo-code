import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { parse, stringify } from 'yaml';
import type {
  ServerRuntimeConfig,
  ServerWorkspaceRecord,
} from './server-config.types';
import {
  defaultWorkspaceName,
  normalizeWorkspacePath,
  workspaceIdFromCwd,
} from '../workspaces/workspaces.utils';

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ALLOWED_CORS_HOSTS = ['localhost', '127.0.0.1', '::1'];
const DEFAULT_WORKSPACE_ROOT_PATH = '/';

type ParsedServerConfig = {
  auth?: {
    username?: unknown;
    password?: unknown;
    accessTokenSecret?: unknown;
    refreshTokenSecret?: unknown;
    accessTokenTtlSeconds?: unknown;
    refreshTokenTtlSeconds?: unknown;
  };
  security?: {
    corsAllowedHosts?: unknown;
  };
  workspaces?: unknown;
  workspaceBrowser?: {
    rootPath?: unknown;
  };
};

function expandHomePath(path: string): string {
  if (!path.startsWith('~')) return path;
  return join(homedir(), path.slice(1));
}

function resolveMemoHome(): string {
  const memoHome = process.env.MEMO_HOME;
  if (!memoHome) return join(homedir(), '.memo');
  return expandHomePath(memoHome);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveServerConfigPath(): Promise<string> {
  const explicitPath = process.env.MEMO_SERVER_CONFIG;
  if (explicitPath) {
    return expandHomePath(explicitPath);
  }

  const memoHome = resolveMemoHome();
  const yamlPath = join(memoHome, 'server.yaml');
  const jsonPath = join(memoHome, 'server.json');

  if (await pathExists(yamlPath)) return yamlPath;
  if (await pathExists(jsonPath)) return jsonPath;

  return yamlPath;
}

function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function randomPassword(): string {
  return randomBytes(12).toString('base64url');
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0)
    return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function normalizeAllowedHosts(input: unknown): string[] {
  if (!Array.isArray(input)) return [...DEFAULT_ALLOWED_CORS_HOSTS];
  const hosts = input
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  if (hosts.length === 0) return [...DEFAULT_ALLOWED_CORS_HOSTS];
  return Array.from(new Set(hosts));
}

function normalizeWorkspaceRootPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_WORKSPACE_ROOT_PATH;
  }
  return normalizeWorkspacePath(value);
}

function normalizeWorkspaceRecords(input: unknown): {
  items: ServerWorkspaceRecord[];
  changed: boolean;
} {
  if (!Array.isArray(input)) {
    return { items: [], changed: true };
  }

  const now = new Date().toISOString();
  const byId = new Map<string, ServerWorkspaceRecord>();
  let changed = false;

  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      changed = true;
      continue;
    }
    const record = item as Record<string, unknown>;
    const rawCwd = readString(record.cwd);
    if (!rawCwd) {
      changed = true;
      continue;
    }

    const cwd = normalizeWorkspacePath(rawCwd);
    const id = readString(record.id) ?? workspaceIdFromCwd(cwd);
    const name = readString(record.name) ?? defaultWorkspaceName(cwd);
    const createdAt = readString(record.createdAt) ?? now;
    const lastUsedAt = readString(record.lastUsedAt) ?? createdAt;
    if (
      id !== record.id ||
      name !== record.name ||
      cwd !== record.cwd ||
      createdAt !== record.createdAt ||
      lastUsedAt !== record.lastUsedAt
    ) {
      changed = true;
    }

    byId.set(id, {
      id,
      name,
      cwd,
      createdAt,
      lastUsedAt,
    });
  }

  const items = Array.from(byId.values()).sort((a, b) =>
    a.cwd.localeCompare(b.cwd),
  );
  if (items.length !== input.length) {
    changed = true;
  }

  return {
    items,
    changed,
  };
}

function parseConfigByExtension(
  raw: string,
  configPath: string,
): ParsedServerConfig {
  if (!raw.trim()) return {};

  const ext = extname(configPath).toLowerCase();

  if (ext === '.json') {
    try {
      return JSON.parse(raw) as ParsedServerConfig;
    } catch (err) {
      throw new Error(
        `Failed to parse ${configPath}: ${(err as Error).message}. Please fix the JSON format.`,
      );
    }
  }

  try {
    return (parse(raw) as ParsedServerConfig | null) ?? {};
  } catch (err) {
    throw new Error(
      `Failed to parse ${configPath}: ${(err as Error).message}. Please fix the YAML format.`,
    );
  }
}

@Injectable()
export class ServerConfigService {
  private readonly logger = new Logger(ServerConfigService.name);
  private configPath: string | null = null;
  private config: ServerRuntimeConfig | null = null;

  async load(): Promise<ServerRuntimeConfig> {
    if (this.config) return this.config;

    const { configPath, config, generated } = await this.readOrCreateConfig();
    this.configPath = configPath;
    this.config = config;

    if (generated) {
      this.logger.warn(
        [
          `Created web-server auth config: ${configPath}`,
          `username="${config.auth.username}"`,
          `password="${config.auth.password}"`,
          'Please change the password after first login.',
        ].join(' | '),
      );
    }

    return config;
  }

  getConfigPath(): string {
    if (this.configPath) return this.configPath;
    const configured = process.env.MEMO_SERVER_CONFIG;
    if (configured) return expandHomePath(configured);
    return join(resolveMemoHome(), 'server.yaml');
  }

  getLoadedConfig(): ServerRuntimeConfig {
    if (!this.config) {
      throw new Error('Server config is not loaded yet. Call load() first.');
    }
    return this.config;
  }

  async updateConfig(
    mutator: (config: ServerRuntimeConfig) => ServerRuntimeConfig,
  ): Promise<ServerRuntimeConfig> {
    const current = await this.load();
    const next = mutator(current);
    const normalized = this.normalizeParsedConfig(
      next as ParsedServerConfig,
    ).config;
    const configPath = this.getConfigPath();
    await this.writeConfig(configPath, normalized);
    this.config = normalized;
    return normalized;
  }

  private async readOrCreateConfig(): Promise<{
    configPath: string;
    config: ServerRuntimeConfig;
    generated: boolean;
  }> {
    const configPath = await resolveServerConfigPath();

    try {
      await access(configPath);
    } catch {
      const created = this.createDefaultConfig();
      await this.writeConfig(configPath, created);
      return { configPath, config: created, generated: true };
    }

    const raw = await readFile(configPath, 'utf8');
    const parsed = parseConfigByExtension(raw, configPath);

    const normalized = this.normalizeParsedConfig(parsed);
    if (normalized.rewriteRequired) {
      await this.writeConfig(configPath, normalized.config);
    }
    return { configPath, config: normalized.config, generated: false };
  }

  private createDefaultConfig(): ServerRuntimeConfig {
    return {
      auth: {
        username: 'memo',
        password: randomPassword(),
        accessTokenSecret: randomSecret(32),
        refreshTokenSecret: randomSecret(48),
        accessTokenTtlSeconds: DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlSeconds: DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      },
      security: {
        corsAllowedHosts: [...DEFAULT_ALLOWED_CORS_HOSTS],
      },
      workspaces: [],
      workspaceBrowser: {
        rootPath: DEFAULT_WORKSPACE_ROOT_PATH,
      },
    };
  }

  private normalizeParsedConfig(parsed: ParsedServerConfig): {
    config: ServerRuntimeConfig;
    rewriteRequired: boolean;
  } {
    let rewriteRequired = false;

    const username = readString(parsed.auth?.username) ?? 'memo';
    if (!readString(parsed.auth?.username)) rewriteRequired = true;

    // Existing config should not generate a new random password on each start.
    const password = readString(parsed.auth?.password) ?? 'memo';
    if (!readString(parsed.auth?.password)) rewriteRequired = true;

    const accessTokenSecret =
      readString(parsed.auth?.accessTokenSecret) ?? randomSecret(32);
    if (!readString(parsed.auth?.accessTokenSecret)) rewriteRequired = true;

    const refreshTokenSecret =
      readString(parsed.auth?.refreshTokenSecret) ?? randomSecret(48);
    if (!readString(parsed.auth?.refreshTokenSecret)) rewriteRequired = true;

    const accessTokenTtlSeconds = normalizePositiveInt(
      parsed.auth?.accessTokenTtlSeconds,
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    );
    if (accessTokenTtlSeconds !== parsed.auth?.accessTokenTtlSeconds)
      rewriteRequired = true;

    const refreshTokenTtlSeconds = normalizePositiveInt(
      parsed.auth?.refreshTokenTtlSeconds,
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
    );
    if (refreshTokenTtlSeconds !== parsed.auth?.refreshTokenTtlSeconds)
      rewriteRequired = true;

    const corsAllowedHosts = normalizeAllowedHosts(
      parsed.security?.corsAllowedHosts,
    );
    if (
      !Array.isArray(parsed.security?.corsAllowedHosts) ||
      corsAllowedHosts.length !== parsed.security.corsAllowedHosts.length
    ) {
      rewriteRequired = true;
    }

    const normalizedWorkspaces = normalizeWorkspaceRecords(parsed.workspaces);
    if (normalizedWorkspaces.changed) {
      rewriteRequired = true;
    }

    const workspaceRootPath = normalizeWorkspaceRootPath(
      parsed.workspaceBrowser?.rootPath,
    );
    if (workspaceRootPath !== parsed.workspaceBrowser?.rootPath) {
      rewriteRequired = true;
    }

    return {
      config: {
        auth: {
          username,
          password,
          accessTokenSecret,
          refreshTokenSecret,
          accessTokenTtlSeconds,
          refreshTokenTtlSeconds,
        },
        security: {
          corsAllowedHosts,
        },
        workspaces: normalizedWorkspaces.items,
        workspaceBrowser: {
          rootPath: workspaceRootPath,
        },
      },
      rewriteRequired,
    };
  }

  private async writeConfig(
    configPath: string,
    config: ServerRuntimeConfig,
  ): Promise<void> {
    await mkdir(dirname(configPath), { recursive: true });

    const ext = extname(configPath).toLowerCase();
    const content =
      ext === '.json'
        ? `${JSON.stringify(config, null, 2)}\n`
        : stringify(config);

    await writeFile(configPath, content, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
