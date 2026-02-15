import { constants } from 'node:fs';
import { access, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServerConfigService } from '../config/server-config.service';
import type { ServerWorkspaceRecord } from '../config/server-config.types';
import type {
  WorkspaceDirEntry,
  WorkspaceFsListResult,
  WorkspaceRecord,
} from './workspaces.types';
import {
  defaultWorkspaceName,
  normalizeWorkspaceName,
  normalizeWorkspacePath,
  workspaceIdFromCwd,
} from './workspaces.utils';

const MAX_DIRECTORY_ITEMS = 200;

function resolveMemoHome(): string {
  const memoHome = process.env.MEMO_HOME;
  if (!memoHome || !memoHome.trim()) return join(homedir(), '.memo');
  if (!memoHome.startsWith('~')) return memoHome;
  return join(homedir(), memoHome.slice(1));
}

function toWorkspaceRecord(input: ServerWorkspaceRecord): WorkspaceRecord {
  return {
    id: input.id,
    name: input.name,
    cwd: input.cwd,
    createdAt: input.createdAt,
    lastUsedAt: input.lastUsedAt,
  };
}

function byNameThenPath(a: WorkspaceRecord, b: WorkspaceRecord): number {
  const nameResult = a.name.localeCompare(b.name, undefined, {
    sensitivity: 'base',
  });
  if (nameResult !== 0) return nameResult;
  return a.cwd.localeCompare(b.cwd);
}

function extractCwdFromHistoryLog(raw: string): string | null {
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      continue;
    const event = parsed as Record<string, unknown>;
    if (event.type !== 'session_start') continue;
    const meta = event.meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) continue;
    const cwd = (meta as Record<string, unknown>).cwd;
    if (typeof cwd !== 'string' || !cwd.trim()) continue;
    return normalizeWorkspacePath(cwd);
  }
  return null;
}

async function collectHistoryCwds(): Promise<string[]> {
  const sessionsDir = join(resolveMemoHome(), 'sessions');
  const results = new Set<string>();

  const walk = async (dirPath: string): Promise<void> => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;

      try {
        const raw = await readFile(fullPath, 'utf8');
        const cwd = extractCwdFromHistoryLog(raw);
        if (cwd) {
          results.add(cwd);
        }
      } catch {
        // Ignore invalid history files.
      }
    }
  };

  await walk(resolve(sessionsDir));
  return Array.from(results.values()).sort((a, b) => a.localeCompare(b));
}

function isWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedRoot = normalizeWorkspacePath(rootPath);
  if (normalizedRoot === '/') return true;
  if (normalizedPath === normalizedRoot) return true;
  return normalizedPath.startsWith(`${normalizedRoot}/`);
}

@Injectable()
export class WorkspacesService {
  private historyHydrated = false;

  constructor(private readonly serverConfigService: ServerConfigService) {}

  async list(): Promise<{ items: WorkspaceRecord[] }> {
    await this.hydrateFromHistoryIfNeeded();
    const config = await this.serverConfigService.load();
    return {
      items: config.workspaces.map(toWorkspaceRecord).sort(byNameThenPath),
    };
  }

  async getById(id: string): Promise<WorkspaceRecord | null> {
    const target = id.trim();
    if (!target) return null;
    const config = await this.serverConfigService.load();
    const found = config.workspaces.find((item) => item.id === target);
    return found ? toWorkspaceRecord(found) : null;
  }

  async resolveWorkspace(input: {
    workspaceId?: string;
    cwd?: string;
  }): Promise<WorkspaceRecord> {
    const workspaceId = input.workspaceId?.trim();
    if (workspaceId) {
      const found = await this.getById(workspaceId);
      if (!found) {
        throw new NotFoundException(`workspace not found: ${workspaceId}`);
      }
      return found;
    }

    const cwd = input.cwd?.trim();
    if (cwd) {
      return this.ensureByCwd(cwd);
    }

    throw new BadRequestException('workspaceId is required');
  }

  async ensureByCwd(
    cwd: string,
    name?: string,
    options?: { validateReadable?: boolean },
  ): Promise<WorkspaceRecord> {
    const normalizedCwd =
      options?.validateReadable === false
        ? normalizeWorkspacePath(cwd)
        : await this.resolveReadableDirectory(cwd);
    const id = workspaceIdFromCwd(normalizedCwd);

    const existing = await this.getById(id);
    if (existing) {
      if (name && name.trim() && existing.name !== name.trim()) {
        const renamed = await this.update(existing.id, { name });
        return renamed.item;
      }
      return existing;
    }

    const now = new Date().toISOString();
    const next: WorkspaceRecord = {
      id,
      cwd: normalizedCwd,
      name: normalizeWorkspaceName(
        name ?? defaultWorkspaceName(normalizedCwd),
        normalizedCwd,
      ),
      createdAt: now,
      lastUsedAt: now,
    };

    await this.serverConfigService.updateConfig((config) => {
      return {
        ...config,
        workspaces: [...config.workspaces, next].sort((a, b) =>
          a.cwd.localeCompare(b.cwd),
        ),
      };
    });

    return next;
  }

  async add(input: {
    cwd?: unknown;
    name?: unknown;
  }): Promise<{ created: boolean; item: WorkspaceRecord }> {
    const cwd = typeof input.cwd === 'string' ? input.cwd.trim() : '';
    if (!cwd) {
      throw new BadRequestException('cwd is required');
    }
    const name = typeof input.name === 'string' ? input.name.trim() : undefined;
    const item = await this.ensureByCwd(cwd, name);
    return { created: true, item };
  }

  async update(
    workspaceId: string,
    input: { name?: unknown },
  ): Promise<{ updated: boolean; item: WorkspaceRecord }> {
    const id = workspaceId.trim();
    if (!id) {
      throw new BadRequestException('workspaceId is required');
    }

    const found = await this.getById(id);
    if (!found) {
      throw new NotFoundException('workspace not found');
    }

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const next = {
      ...found,
      name,
      lastUsedAt: new Date().toISOString(),
    };

    await this.serverConfigService.updateConfig((config) => ({
      ...config,
      workspaces: config.workspaces.map((item) =>
        item.id === id ? next : item,
      ),
    }));

    return { updated: true, item: next };
  }

  async remove(workspaceId: string): Promise<{ deleted: boolean }> {
    const id = workspaceId.trim();
    if (!id) {
      throw new BadRequestException('workspaceId is required');
    }

    const found = await this.getById(id);
    if (!found) {
      throw new NotFoundException('workspace not found');
    }

    await this.serverConfigService.updateConfig((config) => ({
      ...config,
      workspaces: config.workspaces.filter((item) => item.id !== id),
    }));

    return { deleted: true };
  }

  async touchLastUsed(workspaceId: string): Promise<void> {
    const id = workspaceId.trim();
    if (!id) return;

    await this.serverConfigService.updateConfig((config) => ({
      ...config,
      workspaces: config.workspaces.map((item) =>
        item.id === id
          ? {
              ...item,
              lastUsedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
  }

  async listDirectories(
    pathInput: string | undefined,
  ): Promise<WorkspaceFsListResult> {
    const config = await this.serverConfigService.load();
    const rootPath = config.workspaceBrowser.rootPath || '/';
    const rootRealPath = await this.resolveReadableDirectory(rootPath);

    let requestedPath = pathInput?.trim() ? pathInput.trim() : rootRealPath;
    if (!pathInput?.trim() && rootRealPath === '/') {
      // Use HOME as default browse entry when root is full filesystem.
      try {
        requestedPath = await this.resolveReadableDirectory(homedir());
      } catch {
        requestedPath = rootRealPath;
      }
    }
    const targetPath = await this.resolveReadableDirectory(requestedPath);

    if (!isWithinRoot(targetPath, rootRealPath)) {
      throw new BadRequestException('path is outside workspace browser root');
    }

    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(targetPath, { withFileTypes: true });
    } catch {
      throw new BadRequestException('failed to read directory');
    }

    const sortedEntries = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );

    const items: WorkspaceDirEntry[] = [];
    for (const entry of sortedEntries) {
      if (items.length >= MAX_DIRECTORY_ITEMS) break;
      const candidate = resolve(targetPath, entry.name);

      let directoryPath: string | null = null;
      if (entry.isDirectory()) {
        directoryPath = normalizeWorkspacePath(candidate);
      } else if (entry.isSymbolicLink()) {
        try {
          const linked = normalizeWorkspacePath(await realpath(candidate));
          const linkedStat = await stat(linked);
          if (!linkedStat.isDirectory()) continue;
          if (!isWithinRoot(linked, rootRealPath)) continue;
          directoryPath = linked;
        } catch {
          continue;
        }
      } else {
        continue;
      }

      if (!directoryPath) continue;

      let readable = true;
      try {
        await access(directoryPath, constants.R_OK | constants.X_OK);
      } catch {
        readable = false;
      }

      items.push({
        name: entry.name,
        path: directoryPath,
        kind: 'dir',
        readable,
      });
    }

    const parent = dirname(targetPath);
    const parentPath =
      targetPath === rootRealPath || !isWithinRoot(parent, rootRealPath)
        ? null
        : normalizeWorkspacePath(parent);

    return {
      path: normalizeWorkspacePath(targetPath),
      parentPath,
      items,
    };
  }

  private async hydrateFromHistoryIfNeeded(): Promise<void> {
    if (this.historyHydrated) return;
    this.historyHydrated = true;

    const config = await this.serverConfigService.load();
    if (config.workspaces.length > 0) return;

    const cwds = await collectHistoryCwds();
    if (cwds.length === 0) return;

    const now = new Date().toISOString();
    const hydrated = cwds.map<WorkspaceRecord>((cwd) => ({
      id: workspaceIdFromCwd(cwd),
      cwd,
      name: defaultWorkspaceName(cwd),
      createdAt: now,
      lastUsedAt: now,
    }));

    await this.serverConfigService.updateConfig((current) => ({
      ...current,
      workspaces: hydrated,
    }));
  }

  private async resolveReadableDirectory(path: string): Promise<string> {
    const normalizedPath = normalizeWorkspacePath(path);
    let realPath: string;
    try {
      realPath = normalizeWorkspacePath(await realpath(normalizedPath));
    } catch {
      throw new BadRequestException(`directory does not exist: ${path}`);
    }

    let directoryStat: import('node:fs').Stats;
    try {
      directoryStat = await stat(realPath);
    } catch {
      throw new BadRequestException(`directory is not accessible: ${path}`);
    }

    if (!directoryStat.isDirectory()) {
      throw new BadRequestException(`path is not a directory: ${path}`);
    }

    try {
      await access(realPath, constants.R_OK | constants.X_OK);
    } catch {
      throw new BadRequestException(`directory is not readable: ${path}`);
    }

    return realPath;
  }
}
