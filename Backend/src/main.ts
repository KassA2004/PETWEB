import 'reflect-metadata';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { AppModule } from './app.module';
import { auth } from './auth/auth';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { toValidationDetails, ValidationFailedException } from './common/validation.exception';

async function bootstrap(): Promise<void> {
  // bodyParser: false — Better Auth's handler needs the raw, unconsumed
  // request body. If Nest's default body parser ran first, it would already
  // have drained the stream by the time Better Auth tried to read it. We
  // re-enable JSON parsing manually below, AFTER the auth routes are mounted.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // CORS must be registered before ANY route, including the raw auth mount
  // below — Express runs middleware/routes in registration order, and once a
  // route handler sends a response the chain stops. A CORS call placed after
  // the auth mount would simply never run for /api/auth/* requests, which is
  // exactly what happened here the first time (the browser saw no
  // Access-Control-Allow-Origin header on any auth response).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  // Mounted next, still outside Nest's router entirely, matching
  // 01-auth-endpoints.md: "the backend mounts the Better Auth handler and
  // does not hand-write these routes." Resolves to /api/auth/* because
  // `auth.ts` sets basePath: '/api/auth'.
  expressApp.all('/api/auth/{*path}', toNodeHandler(auth));

  // Every other route gets normal JSON body parsing.
  app.use(express.json());

  // 00-conventions.md §1: app routes live under /api/v1/..., Better Auth and
  // /health are excluded from both the prefix and the version segment.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 00-conventions.md §4 + §5: unknown fields stripped, validation failures
  // come back as 422 with per-field details (not Nest's default 400).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => new ValidationFailedException(toValidationDetails(errors)),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
}

void bootstrap();
