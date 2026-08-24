import { Module } from '@nestjs/common';
import { AffectionModule } from '../affection/affection.module';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';

/** One goal, one stretch of time, and the room going quiet around it. */
@Module({
  imports: [AffectionModule],
  controllers: [FocusController],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}
