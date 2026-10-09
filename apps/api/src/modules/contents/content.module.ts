import { Module } from '@nestjs/common';

import { ContentService } from './content.service.js';
import { ContentController } from './content.controller.js';
import { SourcesService } from '../sources/sources.service.js';
import { SourcesController } from '../sources/sources.controller.js';
import { TagsService } from '../sources/tags.service.js';
import { RelationsService } from '../sources/relations.service.js';

/**
 * 内容模块（P1-04 / P1-05 / P1-08）。
 *
 * 依赖方向：ContentModule 导出 ContentService + TagsService + RelationsService，
 * 让 SourcesModule 不必反向 import ContentModule（避免循环依赖）。
 */
@Module({
  controllers: [ContentController, SourcesController],
  providers: [ContentService, SourcesService, TagsService, RelationsService],
  exports: [ContentService, SourcesService, TagsService, RelationsService],
})
export class ContentModule {}