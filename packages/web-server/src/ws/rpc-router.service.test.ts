import assert from 'node:assert';
import { describe, expect, test, vi } from 'vitest';
import { RpcRouterService, type RpcCallContext } from './rpc-router.service';
import { WsRpcError } from './ws.errors';

function createFixture() {
  const sessionsService = {
    list: vi.fn(),
    getSessionDetail: vi.fn(),
    getSessionEvents: vi.fn(),
    removeSessionsByWorkspace: vi.fn(),
  };

  const chatService = {
    deleteSession: vi.fn(),
    createSession: vi.fn(),
    listProviders: vi.fn(),
    listRuntimeBadges: vi.fn(),
    getSessionState: vi.fn(),
    attachSession: vi.fn(),
    closeSession: vi.fn(),
    suggestFiles: vi.fn(),
    submitInput: vi.fn(),
    removeQueuedInput: vi.fn(),
    sendQueuedInputNow: vi.fn(),
    cancelCurrentTurn: vi.fn(),
    compactSession: vi.fn(),
    applyApprovalDecision: vi.fn(),
  };

  const mcpService = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    setActive: vi.fn(),
  };

  const skillsService = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setActive: vi.fn(),
  };

  const workspacesService = {
    list: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    listDirectories: vi.fn(),
  };

  const sessionRegistry = {
    requireOwner: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
  };

  const router = new RpcRouterService(
    sessionsService as never,
    chatService as never,
    mcpService as never,
    skillsService as never,
    workspacesService as never,
    sessionRegistry as never,
  );

  return {
    router,
    sessionsService,
    chatService,
    mcpService,
    skillsService,
    workspacesService,
    sessionRegistry,
  };
}

const context: RpcCallContext = {
  connectionId: 'connection-1',
  username: 'memo',
};

describe('RpcRouterService', () => {
  test('throws METHOD_NOT_FOUND for unknown rpc method', async () => {
    const { router } = createFixture();
    await assert.rejects(
      () => router.dispatch(context, 'unknown.method', {}),
      (error: unknown) => {
        assert.ok(error instanceof WsRpcError);
        assert.strictEqual(error.code, 'METHOD_NOT_FOUND');
        return true;
      },
    );
  });

  test('normalizes non-object params to empty object', async () => {
    const { router, sessionsService } = createFixture();
    sessionsService.list.mockResolvedValue({ items: [] });

    await router.dispatch(context, 'sessions.list', null);

    expect(sessionsService.list).toHaveBeenCalledWith({});
  });

  test('checks ownership before reading session state', async () => {
    const { router, chatService, sessionRegistry } = createFixture();
    chatService.getSessionState.mockReturnValue({ sessionId: 'session-1' });

    const result = await router.dispatch(context, 'chat.session.state', {
      sessionId: ' session-1 ',
    });

    expect(sessionRegistry.requireOwner).toHaveBeenCalledWith(
      'session-1',
      'connection-1',
    );
    expect(chatService.getSessionState).toHaveBeenCalledWith('session-1');
    expect(result).toEqual({ sessionId: 'session-1' });
  });

  test('releases claimed session when attach fails', async () => {
    const { router, chatService, sessionRegistry } = createFixture();
    chatService.attachSession.mockRejectedValue(new Error('attach failed'));

    await expect(
      router.dispatch(context, 'chat.session.attach', { sessionId: 's-1' }),
    ).rejects.toThrow('attach failed');

    expect(sessionRegistry.claim).toHaveBeenCalledWith('s-1', 'connection-1');
    expect(sessionRegistry.release).toHaveBeenCalledWith('s-1', 'connection-1');
  });

  test('closes session and always releases ownership', async () => {
    const { router, chatService, sessionRegistry } = createFixture();
    chatService.closeSession.mockResolvedValue({ closed: true });

    const result = await router.dispatch(context, 'chat.session.close', {
      sessionId: 's-2',
    });

    expect(sessionRegistry.requireOwner).toHaveBeenCalledWith(
      's-2',
      'connection-1',
    );
    expect(chatService.closeSession).toHaveBeenCalledWith('s-2');
    expect(sessionRegistry.release).toHaveBeenCalledWith('s-2', 'connection-1');
    expect(result).toEqual({ closed: true });
  });

  test('normalizes chat.session.create payload fields', async () => {
    const { router, chatService } = createFixture();
    chatService.createSession.mockResolvedValue({ sessionId: 'created' });

    await router.dispatch(context, 'chat.session.create', {
      providerName: ' provider-a ',
      workspaceId: ' workspace-a ',
      cwd: ' /tmp/demo ',
      toolPermissionMode: 'invalid',
      activeMcpServers: ['s1', 1, 's2'],
    });

    expect(chatService.createSession).toHaveBeenCalledWith({
      providerName: 'provider-a',
      workspaceId: 'workspace-a',
      cwd: '/tmp/demo',
      toolPermissionMode: undefined,
      activeMcpServers: ['s1', 's2'],
    });
  });

  test('validates approval decision values', async () => {
    const { router } = createFixture();
    await assert.rejects(
      () =>
        router.dispatch(context, 'chat.approval.respond', {
          sessionId: 's-1',
          fingerprint: 'f-1',
          decision: 'allow',
        }),
      (error: unknown) => {
        assert.ok(error instanceof WsRpcError);
        assert.strictEqual(error.code, 'BAD_REQUEST');
        assert.strictEqual(error.message, 'decision must be once | session | deny');
        return true;
      },
    );
  });

  test('normalizes and validates mcp.active.set names', async () => {
    const { router, mcpService } = createFixture();
    mcpService.setActive.mockResolvedValue({ updated: true });

    await router.dispatch(context, 'mcp.active.set', {
      names: [' a ', 1, '', 'b'],
    });

    expect(mcpService.setActive).toHaveBeenCalledWith(['a', 'b']);
  });

  test('throws BAD_REQUEST when mcp.active.set names is not array', async () => {
    const { router } = createFixture();
    await assert.rejects(
      () => router.dispatch(context, 'mcp.active.set', { names: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof WsRpcError);
        assert.strictEqual(error.code, 'BAD_REQUEST');
        assert.strictEqual(error.message, 'names must be string[]');
        return true;
      },
    );
  });

  test('returns merged result for workspace.remove', async () => {
    const { router, sessionsService, workspacesService } = createFixture();
    sessionsService.removeSessionsByWorkspace.mockResolvedValue({
      deleted: true,
      deletedSessions: 3,
    });
    workspacesService.remove.mockResolvedValue({ deleted: true });

    const result = await router.dispatch(context, 'workspace.remove', {
      workspaceId: 'workspace-1',
    });

    expect(sessionsService.removeSessionsByWorkspace).toHaveBeenCalledWith(
      'workspace-1',
    );
    expect(workspacesService.remove).toHaveBeenCalledWith('workspace-1');
    expect(result).toEqual({
      deleted: true,
      deletedSessions: 3,
    });
  });
});
