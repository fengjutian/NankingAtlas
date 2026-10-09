-- PostgreSQL 扩展启用脚本。docker compose 首次启动时由官方 entrypoint 自动执行。
--
-- 命名约束：文件必须按字典序排在扩展创建之前（00-, 01-, ...），
-- 避免多个 init 脚本之间出现 race。
--
-- 扩展对应产品需求：
--   postgis  - 地理坐标存储、bbox 查询、空间索引（P3 地图）
--   pg_trgm  - 三字符相似度索引，中文 / 英文 / 数字 trigram 模糊搜索（P3 搜索）
--   citext   - email / slug 等大小写不敏感字段（citext 列在 users.email）
--   "uuid-ossp" - gen_random_uuid() 的早期实现；Prisma 用 pgcrypto 更现代
--   pgcrypto - gen_random_uuid() / digest()（Prisma @default(dbgenerated(...))）
--
-- 注意：脚本在容器首次创建库时执行；schema migration 由 Prisma 负责。

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;