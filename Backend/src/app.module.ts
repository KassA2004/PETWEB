import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AffectionModule } from './affection/affection.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { EnvironmentsModule } from './environments/environments.module';
import { FocusModule } from './focus/focus.module';
import { FriendsModule } from './friends/friends.module';
import { GoalsModule } from './goals/goals.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { MemoriesModule } from './memories/memories.module';
import { ParksModule } from './parks/parks.module';
import { PetsModule } from './pets/pets.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    PetsModule,
    EnvironmentsModule,
    AffectionModule,
    FocusModule,
    GoalsModule,
    MemoriesModule,
    MediaModule,
    // --- The social layer (13-social-endpoints.md) -------------------------
    // Registered after the single-user packages, because every one of them
    // builds on something above: users on memories, friends on users, parks on
    // users, chat on friends, and the gateway on all four.
    UsersModule,
    FriendsModule,
    ParksModule,
    ChatModule,
    RealtimeModule,
  ],
})
export class AppModule {}
