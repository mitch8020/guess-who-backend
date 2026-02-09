import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { ImagesService } from './images.service';

@Controller('rooms/:roomId/images')
@UseGuards(PlayerTokenGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required for image uploads.',
        details: {},
      });
    }
    return { image: this.imagesService.uploadImage(roomId, principal, file) };
  }

  @Get()
  list(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required for listing images.',
        details: {},
      });
    }
    return this.imagesService.listImages(roomId, principal);
  }

  @Delete(':imageId')
  remove(
    @Param('roomId') roomId: string,
    @Param('imageId') imageId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): void {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required for deleting images.',
        details: {},
      });
    }
    this.imagesService.deleteImage(roomId, imageId, principal);
  }
}
