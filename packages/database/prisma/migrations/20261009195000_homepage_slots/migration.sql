-- 首页可配置槽位（P2-02）。
--
-- 技术方案 §4：「homepage_slots | slot_key、content_id、position、
-- starts_at、ends_at；由后台配置」。
--
-- 设计要点：
--   - slot_key 唯一：一个槽位键（如 'hero' / 'featured'）只对应一行，
--     后台改配置是 UPDATE 而不是 INSERT，避免重复槽位。
--   - content_id 可空：空槽位表示"该位置暂不展示"（排期中/已下架）。
--   - starts_at / ends_at 支持排期；两者皆 NULL 表示常驻。
--   - content_id 上的 ON DELETE CASCADE：内容被物理删除时槽位一并清理。
--     注意业务上正常删除走 archived_at 软删除，不会触发此级联。
--
-- 回滚方案：DROP TABLE homepage_slots;（无数据依赖，仅被 API 读取）

CREATE TABLE `homepage_slots` (
    `id` TEXT NOT NULL PRIMARY KEY,
    `slot_key` TEXT NOT NULL,
    `content_id` TEXT,
    `position` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME,
    `ends_at` DATETIME,
    `updated_at` DATETIME NOT NULL,
    `updated_by` TEXT,
    CONSTRAINT `homepage_slots_content_id_fkey`
        FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX `homepage_slots_slot_key_key` ON `homepage_slots`(`slot_key`);

CREATE INDEX `homepage_slots_slot_key_position_idx` ON `homepage_slots`(`slot_key`, `position`);