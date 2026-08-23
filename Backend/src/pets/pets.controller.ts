import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import {
  CreatePetDto,
  ReplaceAppearanceDto,
  SetActivePetDto,
  UpdatePetDto,
} from './dto/pet.dto';
import { PetsService } from './pets.service';
import type { PetLibraryView, PetView } from './pets.service';

/**
 * /api/v1/pets — the user's saved creatures.
 *
 * Every route is scoped to the session user by the service; nothing here takes
 * an owner id from the request, so there is no way to ask for someone else's
 * pet in the first place.
 *
 * Route ordering matters: `/pets/active` is declared before `/pets/:petId` so
 * the literal segment is not swallowed as a UUID param
 * (03-pet-endpoints.md §2).
 */
@Controller({ path: 'pets', version: '1' })
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  /** Every saved preset, plus which one is selected. */
  @Get()
  list(@CurrentUser() user: SessionUser): Promise<PetLibraryView> {
    return this.pets.list(user.id);
  }

  /** The creature that should be in the room right now, or null. */
  @Get('active')
  active(@CurrentUser() user: SessionUser): Promise<PetView | null> {
    return this.pets.findActive(user.id);
  }

  /** Choose which saved preset is live. */
  @Put('active')
  setActive(
    @CurrentUser() user: SessionUser,
    @Body() body: SetActivePetDto,
  ): Promise<PetLibraryView> {
    return this.pets.setActive(user.id, body.petId ?? null);
  }

  /** Save the creature currently being edited as a new preset. */
  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body() body: CreatePetDto,
  ): Promise<PetView> {
    return this.pets.create(user.id, body);
  }

  @Get(':petId')
  findOne(
    @CurrentUser() user: SessionUser,
    @Param('petId', ParseUUIDPipe) petId: string,
  ): Promise<PetView> {
    return this.pets.findOne(user.id, petId);
  }

  @Patch(':petId')
  rename(
    @CurrentUser() user: SessionUser,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Body() body: UpdatePetDto,
  ): Promise<PetView> {
    return this.pets.rename(user.id, petId, body.name);
  }

  /** Commit the current edits onto an existing preset. */
  @Put(':petId/appearance')
  replaceAppearance(
    @CurrentUser() user: SessionUser,
    @Param('petId', ParseUUIDPipe) petId: string,
    @Body() body: ReplaceAppearanceDto,
  ): Promise<PetView> {
    return this.pets.replaceAppearance(user.id, petId, body.appearanceData);
  }

  /**
   * Delete a preset.
   *
   * Returns the remaining library rather than 204, because deleting can change
   * which pet is selected and the client would otherwise have to guess or
   * refetch.
   */
  @Delete(':petId')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('petId', ParseUUIDPipe) petId: string,
  ): Promise<PetLibraryView> {
    return this.pets.remove(user.id, petId);
  }
}
