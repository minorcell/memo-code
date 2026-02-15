import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SkillsService } from './skills.service';

type CreateSkillBody = {
  scope?: unknown;
  workspaceId?: unknown;
  name?: unknown;
  description?: unknown;
  content?: unknown;
};

type UpdateSkillBody = {
  description?: unknown;
  content?: unknown;
};

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  async list(@Query() query: Record<string, unknown>) {
    return this.skillsService.list({
      scope: query.scope,
      q: query.q,
      workspaceId: query.workspaceId,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.skillsService.get(id);
  }

  @Post()
  async create(@Body() body: CreateSkillBody) {
    return this.skillsService.create({
      ...body,
      workspaceId: (body as Record<string, unknown>).workspaceId,
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateSkillBody) {
    return this.skillsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.skillsService.remove(id);
  }
}
