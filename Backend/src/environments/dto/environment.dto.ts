import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request bodies for the environment endpoints.
 *
 * `sceneData` is typed as a bare object here and checked properly in
 * ../room-style.ts. class-validator can say "this is an object"; it cannot say
 * "this is a room that will render", and pretending otherwise would mean
 * mirroring the frontend's texture and decor catalogs into decorators.
 *
 * Note the interaction with the global ValidationPipe's `whitelist: true`: any
 * field not declared here is stripped from the request. That is what stops a
 * client from setting `ownerId` on an update.
 */
export class UpdateEnvironmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 48)
  name?: string;

  /** The client always submits the room's complete appearance. */
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  sceneData?: Record<string, unknown>;
}

/** The style on its own, for the dedicated appearance route. */
export class ReplaceSceneDto {
  @IsObject()
  @IsNotEmptyObject()
  sceneData!: Record<string, unknown>;
}

/**
 * One object in the room.
 *
 * `col`/`row` are bounded generously rather than against the actual grid: the
 * grid's shape is the client's business (`world/FloorGrid.ts` — ten by five
 * today), and a backend that hard-coded it would have to be redeployed to
 * change a tile size. What it does enforce is that they are small integers, so
 * nothing absurd reaches the column. The client clamps to real cells on the way
 * back in, the same way it re-normalizes a room style.
 */
export class PlacedObjectDto {
  @IsString()
  @Length(1, 64)
  key!: string;

  @IsString()
  @Length(1, 40)
  type!: string;

  @IsInt()
  @Min(0)
  @Max(255)
  col!: number;

  @IsInt()
  @Min(0)
  @Max(255)
  row!: number;

  /** Seed and colours. Checked properly in ../object-definition.ts. */
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

/**
 * The whole arrangement, in one write.
 *
 * Capped at a number a room could not sensibly hold: a hundred pieces of
 * furniture is not a room the user is enjoying, and the cap is what stops a
 * single request writing an unbounded number of rows.
 */
export class ReplaceObjectsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlacedObjectDto)
  objects!: PlacedObjectDto[];
}
