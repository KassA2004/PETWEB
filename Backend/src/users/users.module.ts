import { Module } from '@nestjs/common';
import { MemoriesModule } from '../memories/memories.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Profiles, the unique username, and what a visitor may see of somebody.
 *
 * Exports `UsersService` because the friend, park and chat packages all need
 * to turn ids into names and creatures, and every one of them must do it the
 * same way — through `PublicUserView`, which cannot carry an email.
 */
@Module({
  imports: [MemoriesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
