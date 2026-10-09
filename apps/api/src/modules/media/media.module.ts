import { Module } from '@nestjs/common';

import { MediaService } from './media.service.js';
import { MediaController } from './media.controller.js';

/** 媒体模块（P1-09）。 */
@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}