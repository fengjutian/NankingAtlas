import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

/** 媒体模块（P1-09）。 */
@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
