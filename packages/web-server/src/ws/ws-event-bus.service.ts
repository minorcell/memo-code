import { Injectable } from '@nestjs/common';
import type { RpcEventFrame } from './ws.types';

@Injectable()
export class WsEventBus {
  private seq = 0;

  create(topic: string, data: unknown): RpcEventFrame {
    this.seq += 1;
    return {
      type: 'event',
      topic,
      data,
      seq: this.seq,
      ts: new Date().toISOString(),
    };
  }
}
