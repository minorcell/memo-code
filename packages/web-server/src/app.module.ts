import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessTokenGuard } from './auth/access-token.guard';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { ApiErrorFilter } from './common/filters/api-error.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { ServerConfigModule } from './config/server-config.module';
import { ChatModule } from './chat/chat.module';
import { McpModule } from './mcp/mcp.module';
import { SessionsModule } from './sessions/sessions.module';
import { SkillsModule } from './skills/skills.module';
import { StreamModule } from './stream/stream.module';
import { WsGatewayModule } from './ws/ws-gateway.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ServerConfigModule,
    WorkspacesModule,
    AuthModule,
    SessionsModule,
    StreamModule,
    ChatModule,
    McpModule,
    SkillsModule,
    WsGatewayModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ApiErrorFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
