import { lstat, rmdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HistoryIndex,
  normalizeWorkspacePath,
  workspaceIdFromCwd,
} from '@memo-code/core';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type {
  ListSessionsQuery,
  SessionDetail,
  SessionEventsQuery,
  SessionEventsResponse,
  SessionListResponse,
} from './sessions.types';

function resolveMemoHome(): string {
  const memoHome = process.env.MEMO_HOME;
  if (!memoHome || !memoHome.trim()) return join(homedir(), '.memo');
  if (!memoHome.startsWith('~')) return memoHome;
  return join(homedir(), memoHome.slice(1));
}

function parsePage(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function parseSortBy(value: unknown): ListSessionsQuery['sortBy'] | undefined {
  if (typeof value !== 'string') return undefined;
  if (
    value === 'updatedAt' ||
    value === 'startedAt' ||
    value === 'project' ||
    value === 'title'
  ) {
    return value;
  }
  return undefined;
}

function parseOrder(value: unknown): ListSessionsQuery['order'] | undefined {
  if (value === 'asc' || value === 'desc') return value;
  return undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

@Injectable()
export class SessionsService {
  private readonly sessionsDir = resolve(join(resolveMemoHome(), 'sessions'));
  private readonly historyIndex = new HistoryIndex({
    sessionsDir: this.sessionsDir,
  });

  constructor(private readonly workspacesService: WorkspacesService) {}

  async list(query: Record<string, unknown>): Promise<SessionListResponse> {
    const normalized: ListSessionsQuery = {
      page: parsePage(query.page),
      pageSize: parsePage(query.pageSize),
      sortBy: parseSortBy(query.sortBy),
      order: parseOrder(query.order),
      project: parseString(query.project),
      workspaceId: parseString(query.workspaceId),
      dateFrom: parseString(query.dateFrom),
      dateTo: parseString(query.dateTo),
      q: parseString(query.q),
    };

    if (normalized.workspaceId) {
      const workspace = await this.workspacesService.getById(
        normalized.workspaceId,
      );
      if (!workspace) {
        return {
          items: [],
          page: normalized.page ?? 1,
          pageSize: normalized.pageSize ?? 20,
          total: 0,
          totalPages: 0,
        };
      }
      normalized.workspaceCwd = workspace.cwd;
    }

    return this.historyIndex.list(normalized);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const detail = await this.historyIndex.getSessionDetail(sessionId);
    if (!detail) {
      throw new NotFoundException('Session not found');
    }
    return {
      ...detail,
      workspaceId: detail.workspaceId || workspaceIdFromCwd(detail.cwd),
    };
  }

  async getSessionEvents(
    sessionId: string,
    query: Record<string, unknown>,
  ): Promise<SessionEventsResponse> {
    const normalized: SessionEventsQuery = {
      cursor: parseString(query.cursor),
      limit: parsePage(query.limit),
    };
    const events = await this.historyIndex.getSessionEvents(
      sessionId,
      normalized.cursor,
      normalized.limit,
    );
    if (!events) {
      throw new NotFoundException('Session not found');
    }
    return events;
  }

  async listAllSessionSummaries() {
    return this.historyIndex.getAllSummaries();
  }

  async removeSession(sessionId: string): Promise<{ deleted: boolean }> {
    const target = sessionId.trim();
    if (!target) {
      throw new NotFoundException('Session not found');
    }

    const detail = await this.historyIndex.getSessionDetail(target);
    if (!detail) {
      throw new NotFoundException('Session not found');
    }

    await this.removeSessionFile(detail.filePath);

    await this.historyIndex.refresh();
    return { deleted: true };
  }

  async removeSessionsByWorkspace(
    workspaceId: string,
  ): Promise<{ deleted: boolean; deletedSessions: number }> {
    const target = workspaceId.trim();
    if (!target) {
      throw new NotFoundException('workspace not found');
    }

    const workspace = await this.workspacesService.getById(target);
    if (!workspace) {
      throw new NotFoundException('workspace not found');
    }

    const workspaceCwd = normalizeWorkspacePath(workspace.cwd);
    const summaries = await this.historyIndex.getAllSummaries();
    const filePaths: string[] = Array.from(
      new Set(
        summaries
          .filter(
            (summary) => normalizeWorkspacePath(summary.cwd) === workspaceCwd,
          )
          .map((summary) => summary.filePath)
          .filter(
            (filePath): filePath is string =>
              typeof filePath === 'string' && filePath.trim().length > 0,
          ),
      ),
    );

    let deletedSessions = 0;
    for (const filePath of filePaths) {
      const deleted = await this.removeSessionFile(filePath);
      if (deleted) {
        deletedSessions += 1;
      }
    }

    await this.historyIndex.refresh();
    return { deleted: true, deletedSessions };
  }

  private normalizeSafeSessionFilePath(filePath: string): string {
    const resolvedPath = resolve(filePath);
    if (!resolvedPath.endsWith('.jsonl')) {
      throw new Error(
        `Refusing to remove non-jsonl session file: ${resolvedPath}`,
      );
    }
    if (
      resolvedPath === this.sessionsDir ||
      !resolvedPath.startsWith(`${this.sessionsDir}${sep}`)
    ) {
      throw new Error(
        `Refusing to remove file outside sessions dir: ${resolvedPath}`,
      );
    }
    return resolvedPath;
  }

  private async removeSessionFile(filePath: string): Promise<boolean> {
    const safePath = this.normalizeSafeSessionFilePath(filePath);

    try {
      const info = await lstat(safePath);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error(`Refusing to remove non-regular file: ${safePath}`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return false;
      throw error;
    }

    try {
      await unlink(safePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return false;
      throw error;
    }

    await this.pruneEmptyParentDirectories(safePath);
    return true;
  }

  private async pruneEmptyParentDirectories(filePath: string): Promise<void> {
    let current = dirname(filePath);
    while (
      current !== this.sessionsDir &&
      current.startsWith(`${this.sessionsDir}${sep}`)
    ) {
      try {
        await rmdir(current);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT' || code === 'ENOTEMPTY') {
          break;
        }
        throw error;
      }
      current = dirname(current);
    }
  }
}
