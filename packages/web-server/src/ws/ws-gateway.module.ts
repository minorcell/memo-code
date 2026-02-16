import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { McpModule } from '../mcp/mcp.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SkillsModule } from '../skills/skills.module';
import { StreamModule } from '../stream/stream.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RpcRouterService } from './rpc-router.service';
import { SessionRuntimeRegistry } from './session-runtime-registry.service';
import { WsEventBus } from './ws-event-bus.service';
import { WsGatewayService } from './ws-gateway.service';

@Module({
  imports: [
    SessionsModule,
    ChatModule,
    McpModule,
    SkillsModule,
    StreamModule,
    WorkspacesModule,
  ],
  providers: [
    WsGatewayService,
    RpcRouterService,
    SessionRuntimeRegistry,
    WsEventBus,
  ],
  exports: [WsGatewayService, SessionRuntimeRegistry],
})
export class WsGatewayModule {}
