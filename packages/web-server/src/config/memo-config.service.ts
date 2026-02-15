import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { parse as parseToml } from 'toml';
import type {
  MemoMcpServerConfig,
  MemoProviderConfig,
  MemoRuntimeConfig,
} from './memo-config.types';

type ParsedMemoConfig = {
  current_provider?: unknown;
  providers?: unknown;
  mcp_servers?: unknown;
  active_mcp_servers?: unknown;
};

const DEFAULT_PROVIDER: MemoProviderConfig = {
  name: 'deepseek',
  env_api_key: 'DEEPSEEK_API_KEY',
  model: 'deepseek-chat',
  base_url: 'https://api.deepseek.com',
};

function expandHome(path: string) {
  if (!path.startsWith('~')) return path;
  return join(homedir(), path.slice(1));
}

function resolveMemoHome(): string {
  const memoHome = process.env.MEMO_HOME;
  if (!memoHome) return join(homedir(), '.memo');
  return expandHome(memoHome);
}

function normalizeProviders(input: unknown): MemoProviderConfig[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];

  const providers: MemoProviderConfig[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value) continue;
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as Record<string, unknown>;
      const name =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof key === 'string' && key.trim()) ||
        '';
      const envApiKey =
        typeof raw.env_api_key === 'string' && raw.env_api_key.trim()
          ? raw.env_api_key.trim()
          : DEFAULT_PROVIDER.env_api_key;
      const model =
        typeof raw.model === 'string' && raw.model.trim()
          ? raw.model.trim()
          : DEFAULT_PROVIDER.model;
      if (!name) continue;
      providers.push({
        name,
        env_api_key: envApiKey,
        model,
        base_url:
          typeof raw.base_url === 'string' && raw.base_url.trim()
            ? raw.base_url.trim()
            : undefined,
      });
    }
  }
  return providers;
}

function normalizeActiveMcpServers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeMcpServers(
  input: unknown,
): Record<string, MemoMcpServerConfig> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const record: Record<string, MemoMcpServerConfig> = {};
  for (const [name, value] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const conf = value as Record<string, unknown>;

    if (typeof conf.url === 'string' && conf.url.trim()) {
      record[name] = {
        type:
          conf.type === 'streamable_http'
            ? 'streamable_http'
            : 'streamable_http',
        url: conf.url,
        headers:
          conf.headers &&
          typeof conf.headers === 'object' &&
          !Array.isArray(conf.headers)
            ? (conf.headers as Record<string, string>)
            : undefined,
        http_headers:
          conf.http_headers &&
          typeof conf.http_headers === 'object' &&
          !Array.isArray(conf.http_headers)
            ? (conf.http_headers as Record<string, string>)
            : undefined,
        bearer_token_env_var:
          typeof conf.bearer_token_env_var === 'string'
            ? conf.bearer_token_env_var
            : undefined,
      };
      continue;
    }

    if (typeof conf.command === 'string' && conf.command.trim()) {
      record[name] = {
        type: conf.type === 'stdio' ? 'stdio' : 'stdio',
        command: conf.command,
        args: Array.isArray(conf.args)
          ? conf.args
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
        env:
          conf.env && typeof conf.env === 'object' && !Array.isArray(conf.env)
            ? (conf.env as Record<string, string>)
            : undefined,
        stderr:
          conf.stderr === 'inherit' ||
          conf.stderr === 'pipe' ||
          conf.stderr === 'ignore'
            ? conf.stderr
            : undefined,
      };
    }
  }

  return record;
}

@Injectable()
export class MemoConfigService {
  private readonly configPath = join(resolveMemoHome(), 'config.toml');

  getConfigPath(): string {
    return this.configPath;
  }

  async load(): Promise<MemoRuntimeConfig> {
    let parsed: ParsedMemoConfig = {};

    try {
      await access(this.configPath);
      const text = await readFile(this.configPath, 'utf8');
      parsed = parseToml(text) as ParsedMemoConfig;
    } catch {
      // Use defaults.
    }

    const providers = normalizeProviders(parsed.providers);
    const normalizedProviders =
      providers.length > 0 ? providers : [DEFAULT_PROVIDER];
    const currentProvider =
      typeof parsed.current_provider === 'string' &&
      parsed.current_provider.trim()
        ? parsed.current_provider.trim()
        : (normalizedProviders[0]?.name ?? DEFAULT_PROVIDER.name);

    return {
      current_provider: currentProvider,
      providers: normalizedProviders,
      mcp_servers: normalizeMcpServers(parsed.mcp_servers),
      active_mcp_servers: normalizeActiveMcpServers(parsed.active_mcp_servers),
    };
  }

  async setActiveMcpServers(names: string[]): Promise<void> {
    const normalized = Array.from(
      new Set(
        names
          .filter((name): name is string => typeof name === 'string')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    );
    const nextLine = `active_mcp_servers = ${JSON.stringify(normalized)}`;

    let content = '';
    try {
      content = await readFile(this.configPath, 'utf8');
    } catch {
      // Create minimal config when missing.
      const loaded = await this.load();
      const provider = loaded.providers[0] ?? DEFAULT_PROVIDER;
      content = [
        `current_provider = ${JSON.stringify(loaded.current_provider)}`,
        nextLine,
        '',
        `[[providers.${provider.name}]]`,
        `name = ${JSON.stringify(provider.name)}`,
        `env_api_key = ${JSON.stringify(provider.env_api_key)}`,
        `model = ${JSON.stringify(provider.model)}`,
        provider.base_url
          ? `base_url = ${JSON.stringify(provider.base_url)}`
          : '',
        '',
      ]
        .filter(Boolean)
        .join('\n');
      await mkdir(dirname(this.configPath), { recursive: true });
      await writeFile(this.configPath, content, 'utf8');
      return;
    }

    if (/^active_mcp_servers\\s*=.*$/m.test(content)) {
      content = content.replace(/^active_mcp_servers\\s*=.*$/m, nextLine);
    } else {
      content = `${content.trimEnd()}\n${nextLine}\n`;
    }
    await mkdir(dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, content, 'utf8');
  }
}
