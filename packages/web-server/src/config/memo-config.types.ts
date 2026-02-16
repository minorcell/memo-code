import type {
  MCPServerConfig as MemoMcpServerConfig,
  MemoConfig,
  ProviderConfig as MemoProviderConfig,
} from '@memo-code/core';

export type { MemoMcpServerConfig, MemoProviderConfig };

export type MemoRuntimeConfig = Pick<
  MemoConfig,
  'current_provider' | 'providers'
> & {
  mcp_servers: Record<string, MemoMcpServerConfig>;
  active_mcp_servers: string[];
};
