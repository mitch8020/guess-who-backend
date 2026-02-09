import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RollbarService } from './rollbar.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RollbarService],
  exports: [RollbarService],
})
export class RollbarModule {}
