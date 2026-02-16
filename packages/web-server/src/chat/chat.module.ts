import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { StreamModule } from '../stream/stream.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [StreamModule, SessionsModule, WorkspacesModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
