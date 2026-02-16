import { homedir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  loadMemoConfig,
  writeMemoConfig,
  type MemoConfig,
  type ProviderConfig,
} from '@memo-code/core';
import type { MemoRuntimeConfig } from './memo-config.types';

const DEFAULT_PROVIDER: ProviderConfig = {
  name: 'deepseek',
  env_api_key: 'DEEPSEEK_API_KEY',
  model: 'deepseek-chat',
  base_url: 'https://api.deepseek.com',
};

function expandHome(path: string): string {
  if (!path.startsWith('~')) return path;
  return join(homedir(), path.slice(1));
}

function resolveMemoHome(): string {
  const memoHome = process.env.MEMO_HOME;
  if (!memoHome) return join(homedir(), '.memo');
  return expandHome(memoHome);
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeProviders(input: unknown): ProviderConfig[] {
  if (!Array.isArray(input)) {
    return [DEFAULT_PROVIDER];
  }

  const providers: ProviderConfig[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const name = readNonEmptyString(record.name);
    if (!name) continue;

    providers.push({
      name,
      env_api_key:
        readNonEmptyString(record.env_api_key) ?? DEFAULT_PROVIDER.env_api_key,
      model: readNonEmptyString(record.model) ?? DEFAULT_PROVIDER.model,
      base_url: readNonEmptyString(record.base_url),
    });
  }

  return providers.length > 0 ? providers : [DEFAULT_PROVIDER];
}

function normalizeCurrentProvider(
  currentProvider: unknown,
  providers: ProviderConfig[],
): string {
  const current = readNonEmptyString(currentProvider);
  if (current && providers.some((provider) => provider.name === current)) {
    return current;
  }
  return providers[0]?.name ?? DEFAULT_PROVIDER.name;
}

function normalizeActiveMcpServers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeMcpServers(input: unknown): MemoRuntimeConfig['mcp_servers'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as MemoRuntimeConfig['mcp_servers'];
}

@Injectable()
export class MemoConfigService {
  private readonly configPath = join(resolveMemoHome(), 'config.toml');

  getConfigPath(): string {
    return this.configPath;
  }

  async load(): Promise<MemoRuntimeConfig> {
    const loaded = await loadMemoConfig();
    const providers = normalizeProviders(loaded.config.providers);

    return {
      current_provider: normalizeCurrentProvider(
        loaded.config.current_provider,
        providers,
      ),
      providers,
      mcp_servers: normalizeMcpServers(loaded.config.mcp_servers),
      active_mcp_servers: normalizeActiveMcpServers(
        loaded.config.active_mcp_servers,
      ),
    };
  }

  async setActiveMcpServers(names: string[]): Promise<void> {
    const loaded = await loadMemoConfig();
    const nextConfig: MemoConfig = {
      ...loaded.config,
      active_mcp_servers: normalizeActiveMcpServers(names),
    };
    await writeMemoConfig(loaded.configPath, nextConfig);
  }
}
