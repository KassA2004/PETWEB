import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';

/**
 * Registers AuthGuard globally (00-conventions.md §2).
 *
 * There is no AuthController here on purpose: the actual `/api/auth/*` routes
 * are Better Auth's own handler, mounted directly on the Express instance in
 * main.ts (before Nest's body parser runs — see the comment there for why).
 * A Nest controller would either duplicate that routing or double-parse the
 * request body, so this module only owns the guard that protects everything
 * else.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
