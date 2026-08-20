import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wraps PrismaClient as a Nest-injectable service.
 *
 * A single instance (`prismaService` below) is created eagerly at module load
 * time, before Nest bootstraps. This is what lets `src/auth/auth.ts` — which
 * configures Better Auth outside Nest's DI container — share the exact same
 * connection pool as every other part of the app, instead of opening a second
 * one.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Eager singleton — see class doc comment for why this exists. */
export const prismaService = new PrismaService();
