import { Injectable } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { McpService } from '../mcp/mcp.service';
import { SessionsService } from '../sessions/sessions.service';
import { SkillsService } from '../skills/skills.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SessionRuntimeRegistry } from './session-runtime-registry.service';
import { WsRpcError } from './ws.errors';

export type RpcCallContext = {
  connectionId: string;
  username: string;
};

type RpcInput = Record<string, unknown>;
type RpcHandler = (
  context: RpcCallContext,
  input: RpcInput,
) => Promise<unknown> | unknown;

const TOOL_PERMISSION_MODES = ['none', 'once', 'full'] as const;
const APPROVAL_DECISIONS = ['once', 'session', 'deny'] as const;

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  code = 'BAD_REQUEST',
): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new WsRpcError(code, `${key} is required`);
  }
  return value.trim();
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function requireTrimmedStringArray(input: RpcInput, key: string): string[] {
  if (!Array.isArray(input[key])) {
    throw new WsRpcError('BAD_REQUEST', `${key} must be string[]`);
  }
  return input[key]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (typeof value !== 'string') return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  message: string,
): T {
  const parsed = asEnum(value, allowed);
  if (!parsed) {
    throw new WsRpcError('BAD_REQUEST', message);
  }
  return parsed;
}

@Injectable()
export class RpcRouterService {
  private readonly handlers: Record<string, RpcHandler>;

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatService: ChatService,
    private readonly mcpService: McpService,
    private readonly skillsService: SkillsService,
    private readonly workspacesService: WorkspacesService,
    private readonly sessionRegistry: SessionRuntimeRegistry,
  ) {
    this.handlers = {
      ...this.buildSessionHandlers(),
      ...this.buildChatHandlers(),
      ...this.buildMcpHandlers(),
      ...this.buildSkillHandlers(),
      ...this.buildWorkspaceHandlers(),
    };
  }

  async dispatch(
    context: RpcCallContext,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const handler = this.handlers[method];
    if (!handler) {
      throw new WsRpcError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
    return handler(context, asObject(params));
  }

  private buildSessionHandlers(): Record<string, RpcHandler> {
    return {
      'sessions.list': (_context, input) => this.sessionsService.list(input),
      'sessions.detail': (_context, input) =>
        this.sessionsService.getSessionDetail(requireString(input, 'sessionId')),
      'sessions.events': (_context, input) =>
        this.sessionsService.getSessionEvents(requireString(input, 'sessionId'), input),
      'sessions.remove': (_context, input) =>
        this.chatService.deleteSession(requireString(input, 'sessionId')),
    };
  }

  private buildChatHandlers(): Record<string, RpcHandler> {
    return {
      'chat.session.create': (_context, input) =>
        this.chatService.createSession({
          providerName: asString(input.providerName),
          workspaceId: asString(input.workspaceId),
          cwd: asString(input.cwd),
          toolPermissionMode: asEnum(input.toolPermissionMode, TOOL_PERMISSION_MODES),
          activeMcpServers: asStringArray(input.activeMcpServers),
        }),
      'chat.providers.list': () => this.chatService.listProviders(),
      'chat.runtimes.list': (_context, input) =>
        this.chatService.listRuntimeBadges({
          workspaceId: asString(input.workspaceId),
        }),
      'chat.session.state': (context, input) =>
        this.chatService.getSessionState(this.requireOwnedSession(input, context)),
      'chat.session.attach': async (context, input) => {
        const sessionId = requireString(input, 'sessionId');
        this.sessionRegistry.claim(sessionId, context.connectionId);
        try {
          return await this.chatService.attachSession(sessionId);
        } catch (error) {
          this.sessionRegistry.release(sessionId, context.connectionId);
          throw error;
        }
      },
      'chat.session.close': (context, input) => {
        const sessionId = this.requireOwnedSession(input, context);
        const result = this.chatService.closeSession(sessionId);
        this.sessionRegistry.release(sessionId, context.connectionId);
        return result;
      },
      'chat.files.suggest': (context, input) => {
        const sessionId = asString(input.sessionId);
        if (sessionId) {
          this.sessionRegistry.requireOwner(sessionId, context.connectionId);
        }
        return this.chatService.suggestFiles({
          query: typeof input.query === 'string' ? input.query : '',
          limit: asFiniteNumber(input.limit),
          sessionId,
          workspaceId: asString(input.workspaceId),
        });
      },
      'chat.input.submit': (context, input) =>
        this.chatService.submitInput(
          this.requireOwnedSession(input, context),
          requireString(input, 'input'),
        ),
      'chat.queue.remove': (context, input) =>
        this.chatService.removeQueuedInput(
          this.requireOwnedSession(input, context),
          requireString(input, 'queueId'),
        ),
      'chat.queue.send_now': (context, input) =>
        this.chatService.sendQueuedInputNow(this.requireOwnedSession(input, context)),
      'chat.turn.cancel': (context, input) =>
        this.chatService.cancelCurrentTurn(this.requireOwnedSession(input, context)),
      'chat.session.compact': (context, input) =>
        this.chatService.compactSession(this.requireOwnedSession(input, context)),
      'chat.approval.respond': (context, input) =>
        this.chatService.applyApprovalDecision(
          this.requireOwnedSession(input, context),
          requireString(input, 'fingerprint'),
          requireEnum(
            input.decision,
            APPROVAL_DECISIONS,
            'decision must be once | session | deny',
          ),
        ),
    };
  }

  private buildMcpHandlers(): Record<string, RpcHandler> {
    return {
      'mcp.servers.list': () => this.mcpService.list(),
      'mcp.servers.get': (_context, input) =>
        this.mcpService.get(requireString(input, 'name')),
      'mcp.servers.create': (_context, input) =>
        this.mcpService.create(requireString(input, 'name'), input.config),
      'mcp.servers.update': (_context, input) =>
        this.mcpService.update(requireString(input, 'name'), input.config),
      'mcp.servers.remove': (_context, input) =>
        this.mcpService.remove(requireString(input, 'name')),
      'mcp.servers.login': (_context, input) =>
        this.mcpService.login(requireString(input, 'name'), asStringArray(input.scopes)),
      'mcp.servers.logout': (_context, input) =>
        this.mcpService.logout(requireString(input, 'name')),
      'mcp.active.set': (_context, input) =>
        this.mcpService.setActive(requireTrimmedStringArray(input, 'names')),
    };
  }

  private buildSkillHandlers(): Record<string, RpcHandler> {
    return {
      'skills.list': (_context, input) =>
        this.skillsService.list({
          scope: input.scope,
          q: input.q,
          workspaceId: input.workspaceId,
        }),
      'skills.get': (_context, input) =>
        this.skillsService.get(requireString(input, 'id')),
      'skills.create': (_context, input) =>
        this.skillsService.create({
          scope: input.scope,
          name: input.name,
          description: input.description,
          content: input.content,
          workspaceId: input.workspaceId,
        }),
      'skills.update': (_context, input) =>
        this.skillsService.update(requireString(input, 'id'), {
          description: input.description,
          content: input.content,
        }),
      'skills.remove': (_context, input) =>
        this.skillsService.remove(requireString(input, 'id')),
      'skills.active.set': (_context, input) =>
        this.skillsService.setActive(requireTrimmedStringArray(input, 'ids')),
    };
  }

  private buildWorkspaceHandlers(): Record<string, RpcHandler> {
    return {
      'workspace.list': () => this.workspacesService.list(),
      'workspace.add': (_context, input) =>
        this.workspacesService.add({
          cwd: input.cwd,
          name: input.name,
        }),
      'workspace.update': (_context, input) =>
        this.workspacesService.update(requireString(input, 'workspaceId'), {
          name: input.name,
        }),
      'workspace.remove': async (_context, input) => {
        const workspaceId = requireString(input, 'workspaceId');
        const sessionsResult =
          await this.sessionsService.removeSessionsByWorkspace(workspaceId);
        const workspaceResult = await this.workspacesService.remove(workspaceId);
        return {
          ...workspaceResult,
          deletedSessions: sessionsResult.deletedSessions,
        };
      },
      'workspace.fs.list': (_context, input) =>
        this.workspacesService.listDirectories(asString(input.path)),
    };
  }

  private requireOwnedSession(
    input: RpcInput,
    context: RpcCallContext,
  ): string {
    const sessionId = requireString(input, 'sessionId');
    this.sessionRegistry.requireOwner(sessionId, context.connectionId);
    return sessionId;
  }
}
