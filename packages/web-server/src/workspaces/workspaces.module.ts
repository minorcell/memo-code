import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';

@Module({
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
