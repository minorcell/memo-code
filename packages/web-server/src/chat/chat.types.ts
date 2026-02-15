import type {
  FileSuggestion,
  LiveSessionState,
  SessionRuntimeBadge,
  SessionTurnStep,
} from '@memo-code/core';

export type ChatSnapshotTurn = {
  turn: number;
  input: string;
  assistant: string;
  status: string;
  errorMessage?: string;
  steps?: SessionTurnStep[];
};

export type ChatSessionSnapshot = {
  state: LiveSessionState;
  turns: ChatSnapshotTurn[];
};

export type CreateLiveSessionInput = {
  providerName?: string;
  workspaceId?: string;
  cwd?: string;
  toolPermissionMode?: 'none' | 'once' | 'full';
  activeMcpServers?: string[];
};

export type ChatProviderRecord = {
  name: string;
  model: string;
  isCurrent: boolean;
};

export type SessionInputResult = {
  accepted: boolean;
  kind: 'turn' | 'command';
  status: 'ok' | 'error' | 'cancelled';
  message?: string;
};

export type ChatRuntimeListResponse = {
  items: SessionRuntimeBadge[];
};

export type ChatFileSuggestionsResponse = {
  items: FileSuggestion[];
};

export type { LiveSessionState };
