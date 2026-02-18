import { randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createAgentSession,
  getFileSuggestions,
  type FileSuggestion,
  JsonlHistorySink,
  type QueuedInputItem,
  resolveSlashCommand,
  resolveContextWindowForProvider,
  type AgentSession,
  type AgentSessionDeps,
  type ApprovalDecision,
  type ApprovalRequest,
  type ChatMessage,
  type SessionTurnStep,
  type ToolPermissionMode,
} from '@memo-code/core';
import { MemoConfigService } from '../config/memo-config.service';
import type {
  MemoProviderConfig,
  MemoRuntimeConfig,
} from '../config/memo-config.types';
import { SessionsService } from '../sessions/sessions.service';
import { StreamService } from '../stream/stream.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type {
  ChatFileSuggestionsResponse,
  ChatProviderRecord,
  ChatRuntimeListResponse,
  ChatSessionSnapshot,
  ChatSnapshotTurn,
  CreateLiveSessionInput,
  LiveSessionState,
  SessionInputResult,
} from './chat.types';

type InternalTurnRecord = {
  turn: number;
  input: string;
  assistant: string;
  status: string;
  errorMessage?: string;
  steps: SessionTurnStep[];
};

type InternalSession = {
  id: string;
  title: string;
  workspaceId: string;
  projectName: string;
  providerName: string;
  model: string;
  cwd: string;
  startedAt: string;
  updatedAt: string;
  status: 'idle' | 'running' | 'closed';
  activeMcpServers: string[];
  toolPermissionMode: 'none' | 'once' | 'full';
  turn: number;
  historyFilePath?: string;
  turns: InternalTurnRecord[];
  pendingApprovals: Map<string, (decision: ApprovalDecision) => void>;
  pendingApproval?: ApprovalRequest;
  nextInputDisplay?: string;
  activeTurn?: number;
  currentContextTokens: number;
  contextWindow: number;
  queuedInputs: QueuedInputItem[];
  queueDraining: boolean;
  agentSession: AgentSession;
};

const MAX_LIVE_SESSIONS = 20;
const MAX_QUEUED_INPUTS = 3;

function normalizeMode(value: unknown): 'none' | 'once' | 'full' {
  if (value === 'none' || value === 'once' || value === 'full') return value;
  return 'once';
}

function toAssistantText(turn: {
  finalText?: string;
  steps: Array<{ assistantText?: string }>;
}): string {
  const finalText = turn.finalText?.trim();
  if (finalText) return finalText;
  return turn.steps
    .map((step) => step.assistantText ?? '')
    .join('')
    .trim();
}

function cloneTurnStep(step: SessionTurnStep): SessionTurnStep {
  return {
    step: step.step,
    assistantText: step.assistantText,
    thinking: step.thinking,
    action: step.action,
    parallelActions: step.parallelActions,
    observation: step.observation,
    resultStatus: step.resultStatus,
  };
}

function cloneTurnSteps(
  steps: SessionTurnStep[] | undefined,
): SessionTurnStep[] {
  if (!steps || steps.length === 0) return [];
  return steps.map(cloneTurnStep);
}

async function findTaskPromptTemplate(templateName: string): Promise<string> {
  const candidates = [
    process.env.MEMO_TASK_PROMPTS_DIR
      ? join(process.env.MEMO_TASK_PROMPTS_DIR, `${templateName}.md`)
      : null,
    join(process.cwd(), 'dist', 'task-prompts', `${templateName}.md`),
    join(
      process.cwd(),
      'packages',
      'tui',
      'src',
      'task-prompts',
      `${templateName}.md`,
    ),
  ].filter((item): item is string => Boolean(item));

  for (const filePath of candidates) {
    const resolved = resolve(filePath);
    try {
      await access(resolved);
      return readFile(resolved, 'utf8');
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Task prompt not found: ${templateName}`);
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key: string) => {
    return vars[key] ?? '';
  });
}

@Injectable()
export class ChatService {
  private readonly sessions = new Map<string, InternalSession>();

  constructor(
    private readonly streamService: StreamService,
    private readonly memoConfigService: MemoConfigService,
    private readonly sessionsService: SessionsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createSession(
    input: CreateLiveSessionInput,
  ): Promise<LiveSessionState> {
    if (this.sessions.size >= MAX_LIVE_SESSIONS) {
      await this.evictOneIdleSession();
    }

    const workspace = await this.workspacesService.resolveWorkspace({
      workspaceId: input.workspaceId,
      cwd: input.cwd,
    });
    await this.workspacesService.touchLastUsed(workspace.id);

    const config = await this.memoConfigService.load();
    const provider = this.selectProvider(
      config.providers,
      input.providerName,
      config.current_provider,
    );
    const contextWindow = resolveContextWindowForProvider(config, provider);

    const sessionId = randomUUID();
    const runtime = await this.createRuntime({
      id: sessionId,
      title: 'New Session',
      workspaceId: workspace.id,
      projectName: workspace.name,
      providerName: provider.name,
      model: provider.model,
      cwd: workspace.cwd,
      startedAt: new Date().toISOString(),
      activeMcpServers:
        input.activeMcpServers && input.activeMcpServers.length > 0
          ? input.activeMcpServers
          : config.active_mcp_servers,
      toolPermissionMode: normalizeMode(input.toolPermissionMode),
      contextWindow,
    });

    this.sessions.set(runtime.id, runtime);
    this.touchSession(runtime);
    this.streamService.broadcast(runtime.id, {
      type: 'session.snapshot',
      payload: this.toState(runtime),
    });
    return this.toState(runtime);
  }

  async attachSession(sessionId: string): Promise<ChatSessionSnapshot> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return this.toSnapshot(existing);
    }

    const detail = await this.sessionsService.getSessionDetail(sessionId);
    const workspace = await this.workspacesService.ensureByCwd(
      detail.cwd || process.cwd(),
      detail.project,
      { validateReadable: false },
    );
    await this.workspacesService.touchLastUsed(workspace.id);

    const config = await this.memoConfigService.load();
    const provider = this.selectProvider(
      config.providers,
      undefined,
      config.current_provider,
    );
    const contextWindow = resolveContextWindowForProvider(config, provider);

    const historyMessages: ChatMessage[] = [];
    const turns: InternalTurnRecord[] = [];

    for (const turn of detail.turns) {
      const input = (turn.input ?? '').trim();
      const assistant = toAssistantText(turn);
      if (input) {
        historyMessages.push({ role: 'user', content: input });
      }
      if (assistant) {
        historyMessages.push({ role: 'assistant', content: assistant });
      }
      turns.push({
        turn: turn.turn,
        input,
        assistant,
        status: turn.status ?? 'ok',
        errorMessage: turn.errorMessage,
        steps: cloneTurnSteps(turn.steps),
      });
    }

    const maxTurn = turns.reduce((max, item) => Math.max(max, item.turn), 0);

    const runtime = await this.createRuntime({
      id: detail.sessionId,
      title: detail.title,
      workspaceId: workspace.id,
      projectName: workspace.name,
      providerName: provider.name,
      model: provider.model,
      cwd: workspace.cwd,
      startedAt: detail.date.startedAt,
      activeMcpServers: config.active_mcp_servers,
      toolPermissionMode: 'once',
      historyFilePath: detail.filePath,
      contextWindow,
    });

    const system = runtime.agentSession.history[0];
    runtime.agentSession.history = system
      ? [system, ...historyMessages]
      : [...historyMessages];
    (runtime.agentSession as unknown as { turnIndex: number }).turnIndex =
      maxTurn;
    (
      runtime.agentSession as unknown as { sessionStartEmitted: boolean }
    ).sessionStartEmitted = true;
    runtime.agentSession.title = detail.title;

    runtime.turn = maxTurn;
    runtime.turns = turns;

    this.sessions.set(runtime.id, runtime);
    this.touchSession(runtime);

    const snapshot = this.toSnapshot(runtime);
    this.streamService.broadcast(runtime.id, {
      type: 'session.snapshot',
      payload: snapshot.state,
    });

    return snapshot;
  }

  getSessionState(sessionId: string): LiveSessionState {
    const session = this.requireSession(sessionId);
    return this.toState(session);
  }

  getSessionSnapshot(sessionId: string): ChatSessionSnapshot {
    const session = this.requireSession(sessionId);
    return this.toSnapshot(session);
  }

  async listProviders(): Promise<ChatProviderRecord[]> {
    const config = await this.memoConfigService.load();
    const current = config.current_provider || config.providers[0]?.name || '';
    return config.providers.map((provider) => ({
      name: provider.name,
      model: provider.model,
      isCurrent: provider.name === current,
    }));
  }

  async listRuntimeBadges(input: {
    workspaceId?: string;
  }): Promise<ChatRuntimeListResponse> {
    const workspaceId = input.workspaceId?.trim();
    const items = Array.from(this.sessions.values())
      .filter((session) => !workspaceId || session.workspaceId === workspaceId)
      .map((session) => ({
        sessionId: session.id,
        workspaceId: session.workspaceId,
        status: session.status,
        updatedAt: session.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items };
  }

  async suggestFiles(input: {
    query: string;
    sessionId?: string;
    workspaceId?: string;
    limit?: number;
  }): Promise<ChatFileSuggestionsResponse> {
    const sessionId = input.sessionId?.trim();
    const workspaceId = input.workspaceId?.trim();

    if (!sessionId && !workspaceId) {
      throw new BadRequestException('sessionId or workspaceId is required');
    }

    let cwd = '';
    if (sessionId) {
      const active = this.sessions.get(sessionId);
      if (active) {
        cwd = active.cwd;
      } else {
        const detail = await this.sessionsService.getSessionDetail(sessionId);
        cwd = detail.cwd || process.cwd();
      }
    } else if (workspaceId) {
      const workspace = await this.workspacesService.resolveWorkspace({
        workspaceId,
      });
      cwd = workspace.cwd;
    }

    const limit =
      typeof input.limit === 'number'
        ? Math.max(1, Math.min(20, Math.floor(input.limit)))
        : 8;
    const items = await getFileSuggestions({
      cwd,
      query: input.query ?? '',
      limit,
      respectGitIgnore: true,
    });

    return {
      items: items.map(
        (item): FileSuggestion => ({
          id: item.id,
          path: item.path,
          name: item.name,
          parent: item.parent,
          isDir: item.isDir,
        }),
      ),
    };
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async deleteSession(sessionId: string): Promise<{ deleted: true }> {
    const target = sessionId.trim();
    if (!target) {
      throw new BadRequestException('sessionId is required');
    }

    if (this.sessions.has(target)) {
      await this.closeSession(target);
    }

    try {
      await this.sessionsService.removeSession(target);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    return { deleted: true };
  }

  async closeSession(sessionId: string): Promise<{ closed: true }> {
    const session = this.requireSession(sessionId);

    this.resolvePendingApprovals(session, 'deny');

    session.status = 'closed';
    this.touchSession(session);
    this.streamService.broadcast(session.id, {
      type: 'session.status',
      payload: {
        status: 'closed',
        workspaceId: session.workspaceId,
        updatedAt: session.updatedAt,
      },
    });

    await session.agentSession.close();
    this.sessions.delete(sessionId);
    this.streamService.disconnectSession(sessionId);

    return { closed: true };
  }

  async submitInput(
    sessionId: string,
    input: string,
  ): Promise<SessionInputResult> {
    const session = this.requireSession(sessionId);
    const trimmed = input.trim();
    if (!trimmed) {
      throw new BadRequestException('input is required');
    }

    if (session.status === 'running') {
      if (session.queuedInputs.length >= MAX_QUEUED_INPUTS) {
        return {
          accepted: false,
          kind: 'turn',
          status: 'error',
          message: `Queue is full (max ${MAX_QUEUED_INPUTS}).`,
        };
      }

      session.queuedInputs.push({
        id: randomUUID(),
        input: trimmed,
        createdAt: new Date().toISOString(),
      });
      this.touchSession(session);
      this.streamService.broadcast(session.id, {
        type: 'session.snapshot',
        payload: this.toState(session),
      });
      return {
        accepted: true,
        kind: 'turn',
        status: 'ok',
      };
    }

    if (trimmed.startsWith('/')) {
      return this.runSlashCommand(session, trimmed);
    }

    return this.runCoreTurn(session, trimmed, trimmed);
  }

  removeQueuedInput(sessionId: string, queueId: string): { removed: boolean } {
    const session = this.requireSession(sessionId);
    const targetQueueId = queueId.trim();
    if (!targetQueueId) {
      throw new BadRequestException('queueId is required');
    }

    const next = session.queuedInputs.filter(
      (item) => item.id !== targetQueueId,
    );
    if (next.length === session.queuedInputs.length) {
      return { removed: false };
    }

    session.queuedInputs = next;
    this.touchSession(session);
    this.streamService.broadcast(session.id, {
      type: 'session.snapshot',
      payload: this.toState(session),
    });
    return { removed: true };
  }

  sendQueuedInputNow(sessionId: string): { triggered: boolean } {
    const session = this.requireSession(sessionId);
    if (session.queuedInputs.length === 0) {
      return { triggered: false };
    }

    if (session.status === 'running') {
      this.cancelCurrentTurn(sessionId);
      return { triggered: true };
    }

    void this.drainQueuedInputs(session);
    return { triggered: true };
  }

  cancelCurrentTurn(sessionId: string): { cancelled: boolean } {
    const session = this.requireSession(sessionId);
    if (session.status === 'running') {
      session.agentSession.cancelCurrentTurn?.('cancelled by user');
      return { cancelled: true };
    }
    return { cancelled: false };
  }

  async compactSession(
    sessionId: string,
  ): Promise<{ compacted: boolean; keptMessages: number }> {
    const session = this.requireSession(sessionId);
    const result = await session.agentSession.compactHistory('manual');
    session.currentContextTokens = Math.max(0, result.afterTokens);
    this.touchSession(session);
    this.streamService.broadcast(session.id, {
      type: 'session.snapshot',
      payload: this.toState(session),
    });

    this.streamService.broadcast(session.id, {
      type: 'system.message',
      payload: {
        title: 'Compact',
        content:
          result.status === 'success'
            ? `Compacted history to ${result.afterTokens} tokens.`
            : result.status === 'skipped'
              ? 'Skipped compaction: no history to compact.'
              : `Compaction failed: ${result.errorMessage ?? 'unknown error'}`,
      },
    });

    return {
      compacted: result.status === 'success',
      keptMessages: session.agentSession.history.length,
    };
  }

  applyApprovalDecision(
    sessionId: string,
    fingerprint: string,
    decision: 'once' | 'session' | 'deny',
  ): { recorded: boolean } {
    const session = this.requireSession(sessionId);
    const resolver = session.pendingApprovals.get(fingerprint);
    if (!resolver) {
      return { recorded: false };
    }

    session.pendingApprovals.delete(fingerprint);
    if (session.pendingApproval?.fingerprint === fingerprint) {
      session.pendingApproval = undefined;
    }
    resolver(decision);
    this.touchSession(session);
    this.streamService.broadcast(session.id, {
      type: 'session.snapshot',
      payload: this.toState(session),
    });
    return { recorded: true };
  }

  private async runSlashCommand(
    session: InternalSession,
    input: string,
  ): Promise<SessionInputResult> {
    const config = await this.memoConfigService.load();
    const result = resolveSlashCommand(input, {
      configPath: this.memoConfigService.getConfigPath(),
      providerName: session.providerName,
      model: session.model,
      mcpServers: config.mcp_servers,
      providers: config.providers,
      toolPermissionMode: session.toolPermissionMode,
    });

    if (result.kind === 'message') {
      this.sendSystemMessage(session, result.title, result.content);
      return { accepted: true, kind: 'command', status: 'ok' };
    }

    if (result.kind === 'exit') {
      await this.closeSession(session.id);
      return {
        accepted: true,
        kind: 'command',
        status: 'ok',
        message: 'session closed',
      };
    }

    if (result.kind === 'new') {
      await this.recreateSessionRuntime(session, {
        title: 'New Session',
        resetTurns: true,
      });
      this.streamService.broadcast(session.id, {
        type: 'session.snapshot',
        payload: this.toState(session),
      });
      this.sendSystemMessage(
        session,
        'New Session',
        'Started a fresh session.',
      );
      return { accepted: true, kind: 'command', status: 'ok' };
    }

    if (result.kind === 'switch_model') {
      await this.recreateSessionRuntime(session, {
        title: session.title,
        providerName: result.provider.name,
        model: result.provider.model,
      });
      this.sendSystemMessage(
        session,
        'Models',
        `Switched to ${result.provider.name} (${result.provider.model}).`,
      );
      this.streamService.broadcast(session.id, {
        type: 'session.snapshot',
        payload: this.toState(session),
      });
      return { accepted: true, kind: 'command', status: 'ok' };
    }

    if (result.kind === 'set_tool_permission') {
      await this.recreateSessionRuntime(session, {
        title: session.title,
        toolPermissionMode: result.mode,
      });
      this.sendSystemMessage(
        session,
        'Tools',
        `Tool permission set to ${result.mode}.`,
      );
      this.streamService.broadcast(session.id, {
        type: 'session.snapshot',
        payload: this.toState(session),
      });
      return { accepted: true, kind: 'command', status: 'ok' };
    }

    if (result.kind === 'compact') {
      await this.compactSession(session.id);
      return { accepted: true, kind: 'command', status: 'ok' };
    }

    if (result.kind === 'init_agents_md') {
      const template = await findTaskPromptTemplate('init_agents');
      const prompt = renderTemplate(template, {});
      return this.runCoreTurn(session, prompt, '/init');
    }

    if (result.kind === 'review_pr') {
      const prNumber = String(result.prNumber);
      const template = await findTaskPromptTemplate('review_pull_request');
      const prompt = renderTemplate(template, {
        pr_number: prNumber,
        backend_strategy: 'web_server',
        backend_details: 'Running from memo web server',
        mcp_server_prefix: 'github',
      });
      return this.runCoreTurn(session, prompt, `/review ${prNumber}`);
    }

    return { accepted: true, kind: 'command', status: 'ok' };
  }

  private async runCoreTurn(
    session: InternalSession,
    prompt: string,
    displayInput: string,
  ): Promise<SessionInputResult> {
    session.nextInputDisplay = displayInput;

    try {
      const result = await session.agentSession.runTurn(prompt);
      return {
        accepted: true,
        kind: 'turn',
        status:
          result.status === 'ok'
            ? 'ok'
            : result.status === 'cancelled'
              ? 'cancelled'
              : 'error',
        message: result.errorMessage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = 'idle';
      this.touchSession(session);
      this.streamService.broadcast(session.id, {
        type: 'error',
        payload: {
          code: 'turn_error',
          message,
        },
      });
      this.streamService.broadcast(session.id, {
        type: 'session.status',
        payload: {
          status: 'idle',
          workspaceId: session.workspaceId,
          updatedAt: session.updatedAt,
        },
      });
      return {
        accepted: true,
        kind: 'turn',
        status: 'error',
        message,
      };
    }
  }

  private async drainQueuedInputs(session: InternalSession): Promise<void> {
    if (session.status !== 'idle') return;
    if (session.queueDraining) return;
    if (session.queuedInputs.length === 0) return;

    session.queueDraining = true;
    try {
      while (session.status === 'idle' && session.queuedInputs.length > 0) {
        const next = session.queuedInputs.shift();
        if (!next) break;

        this.touchSession(session);
        this.streamService.broadcast(session.id, {
          type: 'session.snapshot',
          payload: this.toState(session),
        });

        const input = next.input.trim();
        if (!input) continue;

        if (input.startsWith('/')) {
          await this.runSlashCommand(session, input);
        } else {
          await this.runCoreTurn(session, input, input);
        }
      }
    } finally {
      session.queueDraining = false;
    }
  }

  private async recreateSessionRuntime(
    session: InternalSession,
    options: {
      providerName?: string;
      model?: string;
      toolPermissionMode?: 'none' | 'once' | 'full';
      activeMcpServers?: string[];
      title?: string;
      resetTurns?: boolean;
    },
  ): Promise<void> {
    this.resolvePendingApprovals(session, 'deny');
    await session.agentSession.close();
    const config = await this.memoConfigService.load();

    if (options.providerName) session.providerName = options.providerName;
    if (options.model) session.model = options.model;
    if (options.toolPermissionMode) {
      session.toolPermissionMode = options.toolPermissionMode;
    }
    if (options.activeMcpServers) {
      session.activeMcpServers = options.activeMcpServers;
    }
    if (options.title) {
      session.title = options.title;
    }

    session.contextWindow = resolveContextWindowForProvider(config, {
      name: session.providerName,
      model: session.model,
    });
    session.currentContextTokens = 0;

    if (options.resetTurns) {
      session.turn = 0;
      session.turns = [];
    }

    session.agentSession = await this.createCoreSession(session);
    if (!options.resetTurns) {
      this.restoreAgentHistoryFromTurns(session);
    }
    session.status = 'idle';
    this.touchSession(session);
  }

  private restoreAgentHistoryFromTurns(session: InternalSession): void {
    if (!session.turns.length) return;

    const historyMessages: ChatMessage[] = [];
    let maxTurn = 0;

    const sorted = [...session.turns].sort((a, b) => a.turn - b.turn);
    for (const turn of sorted) {
      maxTurn = Math.max(maxTurn, turn.turn);
      const input = turn.input.trim();
      const assistant = turn.assistant.trim();
      if (input) {
        historyMessages.push({ role: 'user', content: input });
      }
      if (assistant) {
        historyMessages.push({ role: 'assistant', content: assistant });
      }
    }

    const system = session.agentSession.history[0];
    session.agentSession.history = system
      ? [system, ...historyMessages]
      : [...historyMessages];
    (session.agentSession as unknown as { turnIndex: number }).turnIndex =
      maxTurn;
    (
      session.agentSession as unknown as { sessionStartEmitted: boolean }
    ).sessionStartEmitted = true;
    session.agentSession.title = session.title;
    session.turn = maxTurn;
  }

  private async createRuntime(input: {
    id: string;
    title: string;
    workspaceId: string;
    projectName: string;
    providerName: string;
    model: string;
    cwd: string;
    startedAt: string;
    activeMcpServers: string[];
    toolPermissionMode: 'none' | 'once' | 'full';
    contextWindow: number;
    historyFilePath?: string;
  }): Promise<InternalSession> {
    const runtime: InternalSession = {
      id: input.id,
      title: input.title,
      workspaceId: input.workspaceId,
      projectName: input.projectName,
      providerName: input.providerName,
      model: input.model,
      cwd: input.cwd,
      startedAt: input.startedAt,
      updatedAt: new Date().toISOString(),
      status: 'idle',
      activeMcpServers: input.activeMcpServers,
      toolPermissionMode: input.toolPermissionMode,
      turn: 0,
      historyFilePath: input.historyFilePath,
      turns: [],
      pendingApprovals: new Map<string, (decision: ApprovalDecision) => void>(),
      currentContextTokens: 0,
      contextWindow: input.contextWindow,
      queuedInputs: [],
      queueDraining: false,
      agentSession: null as unknown as AgentSession,
    };

    runtime.agentSession = await this.createCoreSession(runtime);
    runtime.historyFilePath =
      runtime.historyFilePath ?? runtime.agentSession.historyFilePath;

    return runtime;
  }

  private async createCoreSession(
    runtime: InternalSession,
  ): Promise<AgentSession> {
    const deps: AgentSessionDeps = {
      historySinks: runtime.historyFilePath
        ? [new JsonlHistorySink(runtime.historyFilePath)]
        : undefined,
      onAssistantStep: (chunk, step) => {
        if (!chunk) return;
        const turn = runtime.activeTurn;
        if (!turn) return;

        const record = this.getOrCreateTurnRecord(runtime, turn);
        const stepRecord = this.getOrCreateTurnStep(record, step);
        record.assistant = `${record.assistant}${chunk}`;
        stepRecord.assistantText = `${stepRecord.assistantText ?? ''}${chunk}`;

        this.streamService.broadcast(runtime.id, {
          type: 'assistant.chunk',
          payload: {
            turn,
            step,
            chunk,
          },
        });
      },
      requestApproval: async (request) => {
        runtime.pendingApproval = request;
        this.touchSession(runtime);
        this.streamService.broadcast(runtime.id, {
          type: 'approval.request',
          payload: {
            fingerprint: request.fingerprint,
            toolName: request.toolName,
            reason: request.reason,
            riskLevel: request.riskLevel,
            params: request.params,
          },
        });
        this.streamService.broadcast(runtime.id, {
          type: 'session.snapshot',
          payload: this.toState(runtime),
        });

        return new Promise<ApprovalDecision>((resolve) => {
          runtime.pendingApprovals.set(request.fingerprint, resolve);
        });
      },
      hooks: {
        onTurnStart: ({ turn, input, promptTokens }) => {
          runtime.status = 'running';
          runtime.activeTurn = turn;
          runtime.turn = Math.max(runtime.turn, turn);
          runtime.currentContextTokens =
            typeof promptTokens === 'number' && Number.isFinite(promptTokens)
              ? Math.max(0, promptTokens)
              : runtime.currentContextTokens;

          const displayInput = runtime.nextInputDisplay ?? input;
          runtime.nextInputDisplay = undefined;

          const record = this.getOrCreateTurnRecord(runtime, turn);
          record.input = displayInput;
          record.assistant = '';
          record.status = 'running';
          record.errorMessage = undefined;
          record.steps = [];

          this.touchSession(runtime);
          this.streamService.broadcast(runtime.id, {
            type: 'session.status',
            payload: {
              status: 'running',
              workspaceId: runtime.workspaceId,
              updatedAt: runtime.updatedAt,
            },
          });
          this.streamService.broadcast(runtime.id, {
            type: 'turn.start',
            payload: {
              turn,
              input: displayInput,
              promptTokens,
            },
          });
        },
        onContextUsage: ({
          turn,
          step,
          phase,
          promptTokens,
          contextWindow,
          thresholdTokens,
          usagePercent,
        }) => {
          runtime.currentContextTokens = Math.max(0, promptTokens);
          runtime.contextWindow = Math.max(0, contextWindow);
          this.streamService.broadcast(runtime.id, {
            type: 'context.usage',
            payload: {
              turn,
              step,
              phase,
              promptTokens,
              contextWindow,
              thresholdTokens,
              usagePercent,
            },
          });
        },
        onAction: ({ turn, step, action, parallelActions, thinking }) => {
          const record = this.getOrCreateTurnRecord(runtime, turn);
          const stepRecord = this.getOrCreateTurnStep(record, step);
          stepRecord.action = action;
          stepRecord.parallelActions =
            parallelActions && parallelActions.length > 1
              ? parallelActions
              : undefined;
          stepRecord.thinking = thinking;

          this.streamService.broadcast(runtime.id, {
            type: 'tool.action',
            payload: {
              turn,
              step,
              action,
              parallelActions:
                parallelActions && parallelActions.length > 0
                  ? parallelActions
                  : undefined,
              thinking,
            },
          });
        },
        onObservation: ({
          turn,
          step,
          observation,
          resultStatus,
          parallelResultStatuses,
        }) => {
          const record = this.getOrCreateTurnRecord(runtime, turn);
          const stepRecord = this.getOrCreateTurnStep(record, step);
          stepRecord.observation = observation;
          stepRecord.resultStatus =
            typeof resultStatus === 'string'
              ? resultStatus
              : parallelResultStatuses?.[0];

          this.streamService.broadcast(runtime.id, {
            type: 'tool.observation',
            payload: {
              turn,
              step,
              observation,
              resultStatus,
              parallelResultStatuses,
            },
          });
        },
        onFinal: ({ turn, finalText, status, errorMessage }) => {
          runtime.activeTurn = undefined;
          runtime.status = 'idle';

          const record = this.getOrCreateTurnRecord(runtime, turn);
          record.assistant = finalText || record.assistant;
          record.status = status;
          record.errorMessage = errorMessage;

          this.touchSession(runtime);
          this.streamService.broadcast(runtime.id, {
            type: 'turn.final',
            payload: {
              turn,
              finalText,
              status,
              errorMessage,
            },
          });
          this.streamService.broadcast(runtime.id, {
            type: 'session.status',
            payload: {
              status: 'idle',
              workspaceId: runtime.workspaceId,
              updatedAt: runtime.updatedAt,
            },
          });
          this.streamService.broadcast(runtime.id, {
            type: 'session.snapshot',
            payload: this.toState(runtime),
          });
          void this.drainQueuedInputs(runtime);
        },
        onTitleGenerated: ({ title }) => {
          runtime.title = title;
          this.touchSession(runtime);
          this.streamService.broadcast(runtime.id, {
            type: 'session.snapshot',
            payload: this.toState(runtime),
          });
        },
        onApprovalResponse: ({ fingerprint }) => {
          runtime.pendingApprovals.delete(fingerprint);
          if (runtime.pendingApproval?.fingerprint === fingerprint) {
            runtime.pendingApproval = undefined;
          }
          this.touchSession(runtime);
          this.streamService.broadcast(runtime.id, {
            type: 'session.snapshot',
            payload: this.toState(runtime),
          });
        },
      },
    };

    return createAgentSession(deps, {
      sessionId: runtime.id,
      mode: 'interactive',
      providerName: runtime.providerName,
      contextWindow: runtime.contextWindow,
      activeMcpServers: runtime.activeMcpServers,
      toolPermissionMode: runtime.toolPermissionMode as ToolPermissionMode,
      dangerous: runtime.toolPermissionMode === 'full',
      cwd: runtime.cwd,
    });
  }

  private getOrCreateTurnRecord(
    runtime: InternalSession,
    turn: number,
  ): InternalTurnRecord {
    let record = runtime.turns.find((item) => item.turn === turn);
    if (record) return record;

    record = {
      turn,
      input: '',
      assistant: '',
      status: 'running',
      steps: [],
    };
    runtime.turns.push(record);
    return record;
  }

  private getOrCreateTurnStep(
    record: InternalTurnRecord,
    step: number,
  ): SessionTurnStep {
    let entry = record.steps.find((item) => item.step === step);
    if (entry) return entry;
    entry = { step };
    record.steps.push(entry);
    record.steps.sort((a, b) => a.step - b.step);
    return entry;
  }

  private resolvePendingApprovals(
    session: InternalSession,
    decision: ApprovalDecision,
  ): void {
    for (const resolver of session.pendingApprovals.values()) {
      resolver(decision);
    }
    session.pendingApprovals.clear();
    session.pendingApproval = undefined;
  }

  private sendSystemMessage(
    session: InternalSession,
    title: string,
    content: string,
  ): void {
    this.streamService.broadcast(session.id, {
      type: 'system.message',
      payload: {
        title,
        content,
      },
    });
  }

  private touchSession(session: InternalSession): void {
    session.updatedAt = new Date().toISOString();
  }

  private requireSession(sessionId: string): InternalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException('Live session not found');
    }
    return session;
  }

  private toState(session: InternalSession): LiveSessionState {
    return {
      id: session.id,
      title: session.title,
      workspaceId: session.workspaceId,
      projectName: session.projectName,
      providerName: session.providerName,
      model: session.model,
      cwd: session.cwd,
      startedAt: session.startedAt,
      status: session.status,
      pendingApproval: session.pendingApproval
        ? {
            fingerprint: session.pendingApproval.fingerprint,
            toolName: session.pendingApproval.toolName,
            reason: session.pendingApproval.reason,
            riskLevel: session.pendingApproval.riskLevel,
            params: session.pendingApproval.params,
          }
        : undefined,
      activeMcpServers: session.activeMcpServers,
      toolPermissionMode: session.toolPermissionMode,
      queuedInputs: session.queuedInputs.map((item) => ({ ...item })),
      currentContextTokens: session.currentContextTokens,
      contextWindow: session.contextWindow,
    };
  }

  private toSnapshot(session: InternalSession): ChatSessionSnapshot {
    return {
      state: this.toState(session),
      turns: session.turns.map(
        (turn): ChatSnapshotTurn => ({
          turn: turn.turn,
          input: turn.input,
          assistant: turn.assistant,
          status: turn.status,
          errorMessage: turn.errorMessage,
          steps: cloneTurnSteps(turn.steps),
        }),
      ),
    };
  }

  private selectProvider(
    providers: MemoProviderConfig[],
    preferredName: string | undefined,
    fallbackName: string,
  ): MemoProviderConfig {
    const candidate = preferredName || fallbackName;
    const found = providers.find((provider) => provider.name === candidate);
    if (found) return found;
    if (providers.length > 0) return providers[0] as MemoProviderConfig;
    throw new ServiceUnavailableException(
      'No providers configured in memo config.',
    );
  }

  private async evictOneIdleSession(): Promise<void> {
    const idle = Array.from(this.sessions.values()).find(
      (session) => session.status === 'idle',
    );
    if (!idle) {
      throw new ServiceUnavailableException(
        `Too many live sessions (max=${MAX_LIVE_SESSIONS}).`,
      );
    }
    await this.closeSession(idle.id);
  }
}
