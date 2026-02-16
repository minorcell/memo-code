import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSkill,
  getSkill,
  listSkills,
  removeSkill,
  setActiveSkills,
  SkillsAdminError,
  updateSkill,
} from '@memo-code/core';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Injectable()
export class SkillsService {
  constructor(private readonly workspacesService: WorkspacesService) {}

  async list(options: { scope?: unknown; q?: unknown; workspaceId?: unknown }) {
    const workspaceCwd = await this.resolveWorkspaceCwd(options.workspaceId, {
      requiredWhenProjectScope: options.scope === 'project',
    });

    return this.wrap(() =>
      listSkills({
        scope: options.scope,
        q: options.q,
        workspaceCwd,
      }),
    );
  }

  async get(id: string) {
    const workspaceCwds = await this.listWorkspaceCwds();
    return this.wrap(() => getSkill(id, { workspaceCwds }));
  }

  async create(input: {
    scope?: unknown;
    name?: unknown;
    description?: unknown;
    content?: unknown;
    workspaceId?: unknown;
  }) {
    const workspaceCwd = await this.resolveWorkspaceCwd(input.workspaceId, {
      requiredWhenProjectScope: input.scope === 'project',
    });

    return this.wrap(() =>
      createSkill({
        scope: input.scope,
        name: input.name,
        description: input.description,
        content: input.content,
        workspaceCwd,
      }),
    );
  }

  async update(
    id: string,
    input: {
      description?: unknown;
      content?: unknown;
    },
  ) {
    const workspaceCwds = await this.listWorkspaceCwds();
    return this.wrap(() => updateSkill(id, input, { workspaceCwds }));
  }

  async remove(id: string) {
    const workspaceCwds = await this.listWorkspaceCwds();
    return this.wrap(() => removeSkill(id, { workspaceCwds }));
  }

  async setActive(ids: string[]) {
    const workspaceCwds = await this.listWorkspaceCwds();
    return this.wrap(() => setActiveSkills(ids, { workspaceCwds }));
  }

  private async listWorkspaceCwds(): Promise<string[]> {
    const workspaces = await this.workspacesService.list();
    return workspaces.items.map((item) => item.cwd);
  }

  private async resolveWorkspaceCwd(
    workspaceId: unknown,
    options: { requiredWhenProjectScope: boolean },
  ): Promise<string | null> {
    const id = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!id) {
      if (options.requiredWhenProjectScope) {
        throw new BadRequestException(
          'workspaceId is required when scope=project',
        );
      }
      return null;
    }

    const workspace = await this.workspacesService.getById(id);
    if (!workspace) {
      throw new NotFoundException('workspace not found');
    }
    return workspace.cwd;
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SkillsAdminError) {
        if (error.code === 'NOT_FOUND') {
          throw new NotFoundException(error.message);
        }
        throw new BadRequestException(error.message);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        message || 'skills operation failed',
      );
    }
  }
}
