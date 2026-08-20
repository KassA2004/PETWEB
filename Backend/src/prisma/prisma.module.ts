import { Global, Module } from '@nestjs/common';
import { PrismaService, prismaService } from './prisma.service';

/**
 * Global so every feature module can inject PrismaService without importing
 * this module directly. Provides the eager singleton (`prismaService`) rather
 * than letting Nest construct its own instance, so DI and `src/auth/auth.ts`
 * are guaranteed to be talking to the same client.
 */
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prismaService }],
  exports: [PrismaService],
})
export class PrismaModule {}
