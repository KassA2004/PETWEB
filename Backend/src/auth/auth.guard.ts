import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { auth } from './auth';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard. Per 00-conventions.md §2, everything requires a session except
 * `/api/auth/*`, `GET /api/v1/objects(/:id)` and `GET /health` — those opt out
 * with `@Public()`.
 *
 * Resolves the Better Auth session, then looks up the domain `User` row (by the
 * same id — see 11-schema-additions.md §0) so handlers receive the documented
 * `{ id, email, username }` shape rather than Better Auth's own user object.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, username: true },
    });

    if (!user) {
      // AuthUser exists but the domain User row is missing — the sign-up hook
      // should make this impossible, but fail closed rather than let a
      // handler run with no username.
      throw new UnauthorizedException();
    }

    request.sessionUser = user;
    return true;
  }
}
