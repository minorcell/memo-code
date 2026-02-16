import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('healthz')
  healthz() {
    return {
      status: 'ok',
      service: 'memo-web-server',
    };
  }
}
