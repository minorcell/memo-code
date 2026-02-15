export type MemoProviderConfig = {
  name: string;
  env_api_key: string;
  model: string;
  base_url?: string;
};

export type MemoMcpServerConfig =
  | {
      type?: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      stderr?: 'inherit' | 'pipe' | 'ignore';
    }
  | {
      type?: 'streamable_http';
      url: string;
      headers?: Record<string, string>;
      http_headers?: Record<string, string>;
      bearer_token_env_var?: string;
    };

export type MemoRuntimeConfig = {
  current_provider: string;
  providers: MemoProviderConfig[];
  mcp_servers: Record<string, MemoMcpServerConfig>;
  active_mcp_servers: string[];
};
