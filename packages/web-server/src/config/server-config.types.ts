export type ServerAuthConfig = {
  username: string;
  password: string;
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
};

export type ServerSecurityConfig = {
  corsAllowedHosts: string[];
};

export type ServerWorkspaceRecord = {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  lastUsedAt: string;
};

export type ServerWorkspaceBrowserConfig = {
  rootPath: string;
};

export type ServerRuntimeConfig = {
  auth: ServerAuthConfig;
  security: ServerSecurityConfig;
  workspaces: ServerWorkspaceRecord[];
  workspaceBrowser: ServerWorkspaceBrowserConfig;
};
