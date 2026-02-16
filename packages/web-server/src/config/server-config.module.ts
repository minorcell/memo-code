import { Global, Module } from '@nestjs/common';
import { MemoConfigService } from './memo-config.service';
import { ServerConfigService } from './server-config.service';

@Global()
@Module({
  providers: [ServerConfigService, MemoConfigService],
  exports: [ServerConfigService, MemoConfigService],
})
export class ServerConfigModule {}
