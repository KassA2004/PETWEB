import { Module } from '@nestjs/common';
import { AffectionModule } from '../affection/affection.module';
import { FocusModule } from '../focus/focus.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

/**
 * Goals, and the memories finishing one leaves behind.
 *
 * Depends on focus rather than the other way round, and that direction is the
 * right one: a session names a goal, so focus would have had to import this to
 * do anything, and a cycle between the two would have followed. What goals need
 * from focus is one question - "is this one being worked on right now?"
 */
@Module({
  imports: [FocusModule, AffectionModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
