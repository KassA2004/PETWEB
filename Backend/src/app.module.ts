import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AffectionModule } from './affection/affection.module';
import { AuthModule } from './auth/auth.module';
import { EnvironmentsModule } from './environments/environments.module';
import { FocusModule } from './focus/focus.module';
import { GoalsModule } from './goals/goals.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { MemoriesModule } from './memories/memories.module';
import { PetsModule } from './pets/pets.module';
import { PrismaModule } from './prisma/prisma.module';

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
  ],
})
export class AppModule {}
