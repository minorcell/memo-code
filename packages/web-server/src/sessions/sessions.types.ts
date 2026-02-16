import type {
  SessionDetail,
  SessionEventsResponse,
  SessionListResponse,
} from '@memo-code/core';

export type ListSessionsQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: 'updatedAt' | 'startedAt' | 'project' | 'title';
  order?: 'asc' | 'desc';
  project?: string;
  workspaceId?: string;
  workspaceCwd?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export type SessionEventsQuery = {
  cursor?: string;
  limit?: number;
};

export type { SessionDetail, SessionEventsResponse, SessionListResponse };
