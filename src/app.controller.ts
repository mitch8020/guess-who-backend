import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): Record<string, string> {
    return { status: 'ok' };
  }
}
