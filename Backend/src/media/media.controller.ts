import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { MAX_UPLOAD_BYTES, MEDIA_PURPOSES } from './media-paths';
import type { MediaPurpose } from './media-paths';
import { MediaService } from './media.service';
import type { UploadView } from './media.service';

/** The shape of what Multer hands over, with no dependency on its own types. */
interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

class UploadDto {
  @IsOptional()
  @IsIn(MEDIA_PURPOSES)
  purpose?: MediaPurpose;
}

class DeleteUploadDto {
  @IsString()
  @Length(1, 500)
  url!: string;
}

/**
 * /api/v1/media — uploads.
 *
 * Held in memory rather than streamed to a temporary file: the cap is five
 * megabytes, the bytes have to be inspected before they are trusted anyway, and
 * a file that turns out not to be an image should never have touched the disk.
 *
 * `DELETE` takes the path in a body rather than an id in the URL, which is the
 * one deviation from 09-media-endpoints.md §3 and is deliberate — see
 * `MediaService.remove` for why a bare id is the wrong key to look a file up by.
 */
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(
    @CurrentUser() _user: SessionUser,
    @UploadedFile() file: UploadedImage | undefined,
    @Body() body: UploadDto,
  ): Promise<UploadView> {
    return this.media.store(body.purpose ?? 'memory', file?.buffer ?? Buffer.alloc(0));
  }

  @Delete('uploads')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Body() body: DeleteUploadDto,
  ): Promise<void> {
    return this.media.remove(user.id, body.url);
  }
}
