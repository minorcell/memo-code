import assert from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, describe, test, vi } from 'vitest';

vi.mock('../workspaces/workspaces.utils', () => ({
  defaultWorkspaceName: (cwd: string) =>
    cwd.split('/').filter(Boolean).at(-1) ?? 'workspace',
  normalizeWorkspacePath: (input: string) => input.replace(/\\/g, '/'),
  workspaceIdFromCwd: (cwd: string) =>
    `workspace-${cwd.replace(/[^a-zA-Z0-9]/g, '_')}`,
}));

import { ServerConfigService } from './server-config.service';

type EnvSnapshot = {
  memoHome: string | undefined;
  serverConfig: string | undefined;
};

function snapshotEnv(): EnvSnapshot {
  return {
    memoHome: process.env.MEMO_HOME,
    serverConfig: process.env.MEMO_SERVER_CONFIG,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  if (snapshot.memoHome === undefined) {
    delete process.env.MEMO_HOME;
  } else {
    process.env.MEMO_HOME = snapshot.memoHome;
  }
  if (snapshot.serverConfig === undefined) {
    delete process.env.MEMO_SERVER_CONFIG;
  } else {
    process.env.MEMO_SERVER_CONFIG = snapshot.serverConfig;
  }
}

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const item = tempRoots.pop();
    if (!item) continue;
    await rm(item, { recursive: true, force: true });
  }
});

describe('ServerConfigService', () => {
  test('preserves configured password scalar when normalizing config', async () => {
    const envSnapshot = snapshotEnv();
    const memoHome = await mkdtemp(join(tmpdir(), 'memo-web-server-config-'));
    tempRoots.push(memoHome);
    process.env.MEMO_HOME = memoHome;
    delete process.env.MEMO_SERVER_CONFIG;

    const configPath = join(memoHome, 'server.yaml');
    await writeFile(
      configPath,
      [
        'auth:',
        '  username: memo',
        '  password: 123456',
        'security:',
        '  corsAllowedHosts:',
        '    - localhost',
        '',
      ].join('\n'),
      'utf8',
    );

    try {
      const first = await new ServerConfigService().load();
      assert.strictEqual(first.auth.password, '123456');

      const persisted = parse(await readFile(configPath, 'utf8')) as {
        auth?: { password?: unknown };
      };
      assert.strictEqual(
        typeof persisted.auth?.password,
        'string',
        'password should persist as string after normalization rewrite',
      );
      assert.strictEqual(persisted.auth?.password, '123456');

      const second = await new ServerConfigService().load();
      assert.strictEqual(second.auth.password, '123456');
    } finally {
      restoreEnv(envSnapshot);
    }
  });
});
