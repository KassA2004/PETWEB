import { Type } from 'class-transformer';
import {
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

/**
 * Request bodies for the pet endpoints.
 *
 * `appearanceData` is typed as a bare object here and checked properly in
 * ../pet-appearance.ts. class-validator can say "this is an object"; it cannot
 * say "this is a renderable creature", and pretending otherwise would mean
 * mirroring the frontend's constraint table into decorators (see that file).
 *
 * Note the interaction with the global ValidationPipe's `whitelist: true`: any
 * field not declared here is stripped from the request. That is what stops a
 * client from setting `ownerId` or `stateData` on create.
 */
export class CreatePetDto {
  @IsString()
  @Length(1, 32)
  name!: string;

  @IsObject()
  @IsNotEmptyObject()
  appearanceData!: Record<string, unknown>;

  /** Defaults to the user's first environment when omitted. */
  @IsOptional()
  @IsUUID()
  environmentId?: string;
}

/** Rename only. Appearance has its own endpoint so a rename cannot clobber a rig. */
export class UpdatePetDto {
  @IsString()
  @Length(1, 32)
  name!: string;
}

/** PUT, not PATCH: the editor always submits a complete rig. */
export class ReplaceAppearanceDto {
  @IsObject()
  @IsNotEmptyObject()
  appearanceData!: Record<string, unknown>;
}

/** Which saved pet the user is looking after. Null clears the selection. */
export class SetActivePetDto {
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  petId?: string | null;
}
