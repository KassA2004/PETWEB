import { Module } from '@nestjs/common';
import { AffectionService } from './affection.service';

/**
 * How the creature feels about the user.
 *
 * Its own module rather than a corner of the focus package, because two
 * packages move the value — focus sessions and goal completions — and the
 * alternative is one of them importing the other for a reason that has nothing
 * to do with what either is for.
 */
@Module({
  providers: [AffectionService],
  exports: [AffectionService],
})
export class AffectionModule {}
