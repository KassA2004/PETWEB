import { Module } from '@nestjs/common';
import { EnvironmentObjectsService } from './environment-objects.service';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';

/** The rooms a user owns, and what they look like. */
@Module({
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService, EnvironmentObjectsService],
  exports: [EnvironmentsService, EnvironmentObjectsService],
})
export class EnvironmentsModule {}
