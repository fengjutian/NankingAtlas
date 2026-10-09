import { Module } from '@nestjs/common';

import { HomepageService } from './homepage.service.js';
import { PublicContentController } from './public-content.controller.js';

/**
 * 公开读接口 + 首页槽位模块（P2-01 / P2-02）。
 *
 * 与 ContentModule 并列而不合并：公开接口的字段白名单要求与后台
 * CRUD 完全不同（§7.2「公开接口只返回已发布字段」），放一起容易
 * 在改后台 select 时意外把内部字段泄露出去。
 */
@Module({
  controllers: [PublicContentController],
  providers: [HomepageService],
  exports: [HomepageService],
})
export class HomepageModule {}
