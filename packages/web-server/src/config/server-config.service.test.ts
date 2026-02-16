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

  test('creates default yaml config when missing', async () => {
    const envSnapshot = snapshotEnv();
    const memoHome = await mkdtemp(join(tmpdir(), 'memo-web-server-default-'));
    tempRoots.push(memoHome);
    process.env.MEMO_HOME = memoHome;
    delete process.env.MEMO_SERVER_CONFIG;

    const service = new ServerConfigService();
    try {
      const loaded = await service.load();
      const configPath = join(memoHome, 'server.yaml');
      const persisted = parse(await readFile(configPath, 'utf8')) as {
        auth?: { username?: string; password?: string };
      };

      assert.strictEqual(service.getConfigPath(), configPath);
      assert.strictEqual(loaded.auth.username, 'memo');
      assert.ok(loaded.auth.password.length > 0);
      assert.strictEqual(persisted.auth?.username, 'memo');
      assert.strictEqual(typeof persisted.auth?.password, 'string');
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  test('loads explicit JSON config path and normalizes malformed fields', async () => {
    const envSnapshot = snapshotEnv();
    const memoHome = await mkdtemp(join(tmpdir(), 'memo-web-server-json-'));
    tempRoots.push(memoHome);
    const configPath = join(memoHome, 'custom-server.json');

    process.env.MEMO_HOME = memoHome;
    process.env.MEMO_SERVER_CONFIG = configPath;

    await writeFile(
      configPath,
      JSON.stringify(
        {
          auth: {
            username: true,
            password: 12345,
            accessTokenSecret: '',
            refreshTokenSecret: '',
            accessTokenTtlSeconds: -1,
            refreshTokenTtlSeconds: 'abc',
          },
          security: {
            corsAllowedHosts: [],
          },
          workspaces: [
            { id: 'same', name: 'workspace-a', cwd: '/tmp/workspace-a' },
            { id: 'same', name: 'workspace-b', cwd: '/tmp/workspace-a' },
            { foo: 'invalid' },
          ],
          workspaceBrowser: {
            rootPath: '',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const service = new ServerConfigService();
    try {
      const loaded = await service.load();
      assert.strictEqual(loaded.auth.username, 'true');
      assert.strictEqual(loaded.auth.password, '12345');
      assert.strictEqual(loaded.workspaces.length, 1);
      assert.strictEqual(loaded.workspaceBrowser.rootPath, '/');
      assert.ok(loaded.security.corsAllowedHosts.length > 0);

      const persisted = JSON.parse(await readFile(configPath, 'utf8')) as {
        workspaces?: unknown[];
        auth?: { accessTokenSecret?: string; refreshTokenSecret?: string };
      };
      assert.strictEqual(Array.isArray(persisted.workspaces), true);
      assert.strictEqual(persisted.workspaces?.length, 1);
      assert.ok((persisted.auth?.accessTokenSecret?.length ?? 0) > 0);
      assert.ok((persisted.auth?.refreshTokenSecret?.length ?? 0) > 0);
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  test('throws clear parsing error for invalid json config', async () => {
    const envSnapshot = snapshotEnv();
    const memoHome = await mkdtemp(join(tmpdir(), 'memo-web-server-bad-json-'));
    tempRoots.push(memoHome);
    const configPath = join(memoHome, 'server.json');

    process.env.MEMO_HOME = memoHome;
    process.env.MEMO_SERVER_CONFIG = configPath;
    await writeFile(configPath, '{"auth": ', 'utf8');

    try {
      await assert.rejects(
        () => new ServerConfigService().load(),
        /Failed to parse .*server\.json/,
      );
    } finally {
      restoreEnv(envSnapshot);
    }
  });

  test('updateConfig persists normalized updates', async () => {
    const envSnapshot = snapshotEnv();
    const memoHome = await mkdtemp(join(tmpdir(), 'memo-web-server-update-'));
    tempRoots.push(memoHome);
    process.env.MEMO_HOME = memoHome;
    delete process.env.MEMO_SERVER_CONFIG;

    const service = new ServerConfigService();
    try {
      await service.load();
      const updated = await service.updateConfig((config) => ({
        ...config,
        security: {
          corsAllowedHosts: ['example.com', 'localhost'],
        },
        workspaceBrowser: {
          rootPath: '/tmp/root',
        },
      }));

      assert.deepStrictEqual(updated.security.corsAllowedHosts, [
        'example.com',
        'localhost',
      ]);
      assert.strictEqual(updated.workspaceBrowser.rootPath, '/tmp/root');

      const persisted = parse(
        await readFile(join(memoHome, 'server.yaml'), 'utf8'),
      ) as {
        security?: { corsAllowedHosts?: string[] };
        workspaceBrowser?: { rootPath?: string };
      };
      assert.deepStrictEqual(persisted.security?.corsAllowedHosts, [
        'example.com',
        'localhost',
      ]);
      assert.strictEqual(persisted.workspaceBrowser?.rootPath, '/tmp/root');
    } finally {
      restoreEnv(envSnapshot);
    }
  });
});
