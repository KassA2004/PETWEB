import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ParksController } from './parks.controller';
import { ParksService } from './parks.service';

/**
 * Parks: opening one, finding one, and the rules about being in one.
 *
 * Exports the service because the realtime gateway is the other half of this
 * feature — the socket is what admits somebody to a park — and both halves
 * must enforce capacity, the passcode and membership through exactly one
 * implementation.
 */
@Module({
  imports: [UsersModule],
  controllers: [ParksController],
  providers: [ParksService],
  exports: [ParksService],
})
export class ParksModule {}
