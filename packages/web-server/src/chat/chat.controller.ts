import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import type { CreateLiveSessionInput } from './chat.types';

type SubmitInputBody = {
  input?: unknown;
};

type ApprovalBody = {
  decision?: unknown;
};

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  return trimmed;
}

function parseCreateBody(
  body: Record<string, unknown>,
): CreateLiveSessionInput {
  const mode = body.toolPermissionMode;
  const activeMcp = body.activeMcpServers;
  return {
    providerName:
      typeof body.providerName === 'string' ? body.providerName : undefined,
    workspaceId:
      typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
    cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
    toolPermissionMode:
      mode === 'none' || mode === 'once' || mode === 'full' ? mode : undefined,
    activeMcpServers: Array.isArray(activeMcp)
      ? activeMcp.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

@Controller('api/chat/sessions')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async createSession(@Body() body: Record<string, unknown>) {
    return this.chatService.createSession(parseCreateBody(body));
  }

  @Get('providers')
  async listProviders() {
    return this.chatService.listProviders();
  }

  @Get('runtimes')
  async listRuntimes(@Query() query: Record<string, unknown>) {
    return this.chatService.listRuntimeBadges({
      workspaceId:
        typeof query.workspaceId === 'string' ? query.workspaceId : undefined,
    });
  }

  @Get(':id')
  async getSession(@Param('id') sessionId: string) {
    return this.chatService.getSessionState(sessionId);
  }

  @Delete(':id')
  async deleteSession(@Param('id') sessionId: string) {
    return this.chatService.closeSession(sessionId);
  }

  @Post(':id/input')
  async submitInput(
    @Param('id') sessionId: string,
    @Body() body: SubmitInputBody,
  ) {
    const input = asString(body.input, 'input');
    return this.chatService.submitInput(sessionId, input);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') sessionId: string) {
    return this.chatService.cancelCurrentTurn(sessionId);
  }

  @Post(':id/compact')
  async compact(@Param('id') sessionId: string) {
    return this.chatService.compactSession(sessionId);
  }

  @Post(':id/approvals/:fingerprint')
  async approvalDecision(
    @Param('id') sessionId: string,
    @Param('fingerprint') fingerprint: string,
    @Body() body: ApprovalBody,
  ) {
    const decision = body.decision;
    if (decision !== 'once' && decision !== 'session' && decision !== 'deny') {
      throw new BadRequestException('decision must be once | session | deny');
    }
    return this.chatService.applyApprovalDecision(
      sessionId,
      fingerprint,
      decision,
    );
  }
}
