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

  /**
   * Query logging, off by default and on only when asked.
   *
   * `PRISMA_LOG_QUERIES=1` is the diagnostic switch for measuring query count
   * and duration per request (performance baselining and regression checks).
   * It is never on in a normal run — logging every query is not something a
   * production process should pay for by default.
   */
  constructor() {
    super(
      process.env.PRISMA_LOG_QUERIES === '1'
        ? { log: [{ emit: 'event', level: 'query' }] }
        : {},
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');

    if (process.env.PRISMA_LOG_QUERIES === '1') {
      // @ts-expect-error Prisma's event typing does not narrow on the log config
      this.$on('query', (event: { query: string; duration: number }) => {
        this.logger.debug(`${event.duration}ms ${event.query}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Eager singleton — see class doc comment for why this exists. */
export const prismaService = new PrismaService();
