-- 为 refresh_tokens.token_hash 增加唯一约束。
--
-- 背景：P1-02 的 refresh 流程按 sha256 哈希直接定位 token 记录。
-- 该列此前没有唯一索引，导致：
--   1. 每次刷新都退化成全表扫描；
--   2. 并发刷新无法靠数据库保证"一个哈希只有一行"。
--
-- 安全前置条件：token_hash 存的是 sha256(明文)，256 位熵下碰撞概率可忽略；
-- 且所有写入路径（AuthService.rotateRefreshToken）每次都生成全新随机 token。
-- 因此建唯一索引不会因为历史重复值而失败。
--
-- 回滚方案（expand/contract 的 contract 侧）：
--   DROP INDEX IF EXISTS refresh_tokens_token_hash_key;
-- 回滚不影响数据完整性，只退回"无唯一约束 + 全表扫描"的旧行为。
--
-- SQLite 注意：不支持直接 CREATE UNIQUE INDEX ... ON ... 已有 UNIQUE 列，
-- 但支持对普通列建唯一索引；IF NOT EXISTS 让重复执行安全。

CREATE UNIQUE INDEX IF NOT EXISTS `refresh_tokens_token_hash_key`
    ON `refresh_tokens`(`token_hash`);