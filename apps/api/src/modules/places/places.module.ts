import { Module } from '@nestjs/common';

import { PlacesQueryService } from './places-query.service.js';
import { PlacesSearchController } from './places-search.controller.js';
import { RoutesService } from './routes.service.js';

/**
 * 地图与搜索模块（P3-01 / P3-02 / P3-03 / P3-05 / P3-06）。
 *
 * 与 ContentModule 分开：这里做的是**空间查询 + 关键词检索 + 路线站点**，
 * 用 raw SQL 走 R*Tree 虚表，查询形态与内容 CRUD 完全不同。
 */
@Module({
  controllers: [PlacesSearchController],
  providers: [PlacesQueryService, RoutesService],
  exports: [PlacesQueryService, RoutesService],
})
export class PlacesModule {}
