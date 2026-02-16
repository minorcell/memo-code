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

@Injectable()
export class RpcRouterService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatService: ChatService,
    private readonly mcpService: McpService,
    private readonly skillsService: SkillsService,
    private readonly workspacesService: WorkspacesService,
    private readonly sessionRegistry: SessionRuntimeRegistry,
  ) {}

  async dispatch(
    context: RpcCallContext,
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const input = asObject(params);

    if (method === 'sessions.list') {
      return this.sessionsService.list(input);
    }

    if (method === 'sessions.detail') {
      const sessionId = requireString(input, 'sessionId');
      return this.sessionsService.getSessionDetail(sessionId);
    }

    if (method === 'sessions.events') {
      const sessionId = requireString(input, 'sessionId');
      return this.sessionsService.getSessionEvents(sessionId, input);
    }

    if (method === 'sessions.remove') {
      const sessionId = requireString(input, 'sessionId');
      return this.chatService.deleteSession(sessionId);
    }

    if (method === 'chat.session.create') {
      const mode = input.toolPermissionMode;
      return this.chatService.createSession({
        providerName: asString(input.providerName),
        workspaceId: asString(input.workspaceId),
        cwd: asString(input.cwd),
        toolPermissionMode:
          mode === 'none' || mode === 'once' || mode === 'full'
            ? mode
            : undefined,
        activeMcpServers: Array.isArray(input.activeMcpServers)
          ? input.activeMcpServers.filter(
              (item): item is string => typeof item === 'string',
            )
          : undefined,
      });
    }

    if (method === 'chat.providers.list') {
      return this.chatService.listProviders();
    }

    if (method === 'chat.runtimes.list') {
      return this.chatService.listRuntimeBadges({
        workspaceId: asString(input.workspaceId),
      });
    }

    if (method === 'chat.session.state') {
      const sessionId = requireString(input, 'sessionId');
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      return this.chatService.getSessionState(sessionId);
    }

    if (method === 'chat.session.attach') {
      const sessionId = requireString(input, 'sessionId');
      this.sessionRegistry.claim(sessionId, context.connectionId);
      try {
        return await this.chatService.attachSession(sessionId);
      } catch (error) {
        this.sessionRegistry.release(sessionId, context.connectionId);
        throw error;
      }
    }

    if (method === 'chat.session.close') {
      const sessionId = requireString(input, 'sessionId');
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      const result = this.chatService.closeSession(sessionId);
      this.sessionRegistry.release(sessionId, context.connectionId);
      return result;
    }

    if (method === 'chat.files.suggest') {
      const sessionId = asString(input.sessionId);
      if (sessionId) {
        this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      }
      const query = typeof input.query === 'string' ? input.query : '';
      const limit =
        typeof input.limit === 'number' && Number.isFinite(input.limit)
          ? input.limit
          : undefined;
      return this.chatService.suggestFiles({
        query,
        limit,
        sessionId,
        workspaceId: asString(input.workspaceId),
      });
    }

    if (method === 'chat.input.submit') {
      const sessionId = requireString(input, 'sessionId');
      const text = requireString(input, 'input');
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      return this.chatService.submitInput(sessionId, text);
    }

    if (method === 'chat.turn.cancel') {
      const sessionId = requireString(input, 'sessionId');
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      return this.chatService.cancelCurrentTurn(sessionId);
    }

    if (method === 'chat.session.compact') {
      const sessionId = requireString(input, 'sessionId');
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      return this.chatService.compactSession(sessionId);
    }

    if (method === 'chat.approval.respond') {
      const sessionId = requireString(input, 'sessionId');
      const fingerprint = requireString(input, 'fingerprint');
      const decision = input.decision;
      if (
        decision !== 'once' &&
        decision !== 'session' &&
        decision !== 'deny'
      ) {
        throw new WsRpcError(
          'BAD_REQUEST',
          'decision must be once | session | deny',
        );
      }
      this.sessionRegistry.requireOwner(sessionId, context.connectionId);
      return this.chatService.applyApprovalDecision(
        sessionId,
        fingerprint,
        decision,
      );
    }

    if (method === 'mcp.servers.list') {
      return this.mcpService.list();
    }

    if (method === 'mcp.servers.get') {
      return this.mcpService.get(requireString(input, 'name'));
    }

    if (method === 'mcp.servers.create') {
      const name = requireString(input, 'name');
      return this.mcpService.create(name, input.config);
    }

    if (method === 'mcp.servers.update') {
      const name = requireString(input, 'name');
      return this.mcpService.update(name, input.config);
    }

    if (method === 'mcp.servers.remove') {
      return this.mcpService.remove(requireString(input, 'name'));
    }

    if (method === 'mcp.servers.login') {
      const name = requireString(input, 'name');
      const scopes = Array.isArray(input.scopes)
        ? input.scopes.filter(
            (item): item is string => typeof item === 'string',
          )
        : undefined;
      return this.mcpService.login(name, scopes);
    }

    if (method === 'mcp.servers.logout') {
      return this.mcpService.logout(requireString(input, 'name'));
    }

    if (method === 'mcp.active.set') {
      if (!Array.isArray(input.names)) {
        throw new WsRpcError('BAD_REQUEST', 'names must be string[]');
      }
      const names = input.names
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      return this.mcpService.setActive(names);
    }

    if (method === 'skills.list') {
      return this.skillsService.list({
        scope: input.scope,
        q: input.q,
        workspaceId: input.workspaceId,
      });
    }

    if (method === 'skills.get') {
      return this.skillsService.get(requireString(input, 'id'));
    }

    if (method === 'skills.create') {
      return this.skillsService.create({
        scope: input.scope,
        name: input.name,
        description: input.description,
        content: input.content,
        workspaceId: input.workspaceId,
      });
    }

    if (method === 'skills.update') {
      return this.skillsService.update(requireString(input, 'id'), {
        description: input.description,
        content: input.content,
      });
    }

    if (method === 'skills.remove') {
      return this.skillsService.remove(requireString(input, 'id'));
    }

    if (method === 'skills.active.set') {
      if (!Array.isArray(input.ids)) {
        throw new WsRpcError('BAD_REQUEST', 'ids must be string[]');
      }
      const ids = input.ids
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      return this.skillsService.setActive(ids);
    }

    if (method === 'workspace.list') {
      return this.workspacesService.list();
    }

    if (method === 'workspace.add') {
      return this.workspacesService.add({
        cwd: input.cwd,
        name: input.name,
      });
    }

    if (method === 'workspace.update') {
      return this.workspacesService.update(
        requireString(input, 'workspaceId'),
        {
          name: input.name,
        },
      );
    }

    if (method === 'workspace.remove') {
      const workspaceId = requireString(input, 'workspaceId');
      const sessionsResult =
        await this.sessionsService.removeSessionsByWorkspace(workspaceId);
      const workspaceResult = await this.workspacesService.remove(workspaceId);
      return {
        ...workspaceResult,
        deletedSessions: sessionsResult.deletedSessions,
      };
    }

    if (method === 'workspace.fs.list') {
      const path = asString(input.path);
      return this.workspacesService.listDirectories(path);
    }

    throw new WsRpcError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
  }
}
