import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { McpService } from './mcp.service';

type UpsertMcpBody = {
  name?: unknown;
  config?: unknown;
};

type LoginBody = {
  scopes?: unknown;
};

type ActiveBody = {
  names?: unknown;
};

function requiredName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('name is required');
  }
  return value.trim();
}

@Controller('api/mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  async list() {
    return this.mcpService.list();
  }

  @Get('servers/:name')
  async get(@Param('name') name: string) {
    return this.mcpService.get(name);
  }

  @Post('servers')
  async create(@Body() body: UpsertMcpBody) {
    const name = requiredName(body.name);
    return this.mcpService.create(name, body.config);
  }

  @Put('servers/:name')
  async update(@Param('name') name: string, @Body() body: UpsertMcpBody) {
    return this.mcpService.update(name, body.config);
  }

  @Delete('servers/:name')
  async remove(@Param('name') name: string) {
    return this.mcpService.remove(name);
  }

  @Post('servers/:name/login')
  async login(@Param('name') name: string, @Body() body: LoginBody) {
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((item): item is string => typeof item === 'string')
      : undefined;
    return this.mcpService.login(name, scopes);
  }

  @Post('servers/:name/logout')
  async logout(@Param('name') name: string) {
    return this.mcpService.logout(name);
  }

  @Put('active')
  async setActive(@Body() body: ActiveBody) {
    if (!Array.isArray(body.names)) {
      throw new BadRequestException('names must be string[]');
    }
    const names = body.names
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return this.mcpService.setActive(names);
  }
}
