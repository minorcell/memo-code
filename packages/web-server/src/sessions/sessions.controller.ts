import { Controller, Get, Param, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async listSessions(@Query() query: Record<string, unknown>) {
    return this.sessionsService.list(query);
  }

  @Get(':id')
  async getSession(@Param('id') sessionId: string) {
    return this.sessionsService.getSessionDetail(sessionId);
  }

  @Get(':id/events')
  async getSessionEvents(
    @Param('id') sessionId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sessionsService.getSessionEvents(sessionId, query);
  }
}
