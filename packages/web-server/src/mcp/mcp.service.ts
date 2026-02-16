import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createMcpServer,
  getMcpServer,
  listMcpServers,
  loginMcpServer,
  logoutMcpServer,
  McpAdminError,
  removeMcpServer,
  setActiveMcpServers,
  updateMcpServer,
} from '@memo-code/core';

@Injectable()
export class McpService {
  async list() {
    return this.wrap(() => listMcpServers());
  }

  async get(name: string) {
    return this.wrap(() => getMcpServer(name));
  }

  async create(name: string, configInput: unknown) {
    return this.wrap(() => createMcpServer(name, configInput));
  }

  async update(name: string, configInput: unknown) {
    return this.wrap(() => updateMcpServer(name, configInput));
  }

  async remove(name: string) {
    return this.wrap(() => removeMcpServer(name));
  }

  async login(name: string, scopes: string[] | undefined) {
    return this.wrap(() => loginMcpServer(name, scopes));
  }

  async logout(name: string) {
    return this.wrap(() => logoutMcpServer(name));
  }

  async setActive(names: string[]) {
    return this.wrap(() => setActiveMcpServers(names));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof McpAdminError) {
        if (error.code === 'NOT_FOUND') {
          throw new NotFoundException(error.message);
        }
        throw new BadRequestException(error.message);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(message || 'mcp operation failed');
    }
  }
}
