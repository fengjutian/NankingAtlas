# ADR-0001：数据层采用 SQLite，空间索引采用 R\*Tree

状态：**已接受（Accepted）**
日期：2026-10-10
决策者：仓库维护者（用户）
适用范围：`packages/database`、`apps/api` 全部数据访问、集成测试库、本地与部署环境的数据层

## 1. 背景

`docs/TECHNICAL_IMPLEMENTATION.md` §2 与 `docs/PRODUCT_REQUIREMENTS.md` §6.1 的原始技术选型为
PostgreSQL + PostGIS，搜索依赖 `pg_trgm`。该选型带来以下实际成本：

- 需要独立安装并维护 PostgreSQL 服务实例，CI 需要 service container 才能跑集成测试。
- 需要安装 PostGIS 扩展，扩展版本需与 PostgreSQL 主版本匹配。
- 数据层运维（备份、PITR、连接池监控）与应用代码之外还依赖一套独立基础设施。

维护者已明确决定改用 SQLite，并要求：

- 不迁移回 PostgreSQL/PostGIS。
- 空间索引使用 SQLite 内置 R\*Tree，不得退化为无索引的坐标比较。
- 该方案是正式架构决策，**不得**当作临时 mock 或待替换的临时实现。

## 2. 决策

1. **数据层使用 SQLite**，通过 Prisma 的 `sqlite` provider 访问。
   （`packages/database/prisma/schema.prisma` 的 `datasource.db.provider = "sqlite"`）

2. **空间索引使用 SQLite 内置 R\*Tree 虚表**，不使用普通浮点列的全表扫描冒充空间查询。
   实现在迁移 `20261009130000_place_spatial_index`，查询实现在
   `apps/api/src/modules/places/places-query.service.ts`。

3. **权威坐标仍是 `places.lon` / `places.lat` 两个 REAL 列**。R\*Tree 只做粗筛，
   最终命中判定由应用层浮点比较完成。坐标放大因子 `COORD_SCALE = 10000`（约 11 m 精度）。

4. **中文搜索降级为 `LIKE` + 转义**。无 `pg_trgm` 相似度；FTS5 未启用，不在本决策范围内。
   实现在 `apps/api/src/modules/places/search.service.ts`。

5. **迁移仍然是版本化的**。`prisma migrate deploy` 是生产迁移方式；
   `db push` 仍然被禁止（`AGENTS.md` §5.1 不变）。

## 3. 关键实现约束（易踩坑，务必保留）

以下三条是 SQLite R\*Tree 的真实限制，不是实现缺陷。改动相关代码前必须先读这里：

- **触发器不能写虚表。** SQLite 不允许 trigger 直接写 virtual table，因此迁移中的
  `places_ai` / `places_au` / `places_ad` 只维护普通表 `place_rtree_ids`；
  虚表 `places_rtree` 必须由应用层显式调用 `rebuildIndex()` 重建。
  绕过应用层直接写库，会导致 `place_rtree_ids` 有数据但虚表为空，
  bbox 查询经 `JOIN places_rtree` 返回空集，表现为「地图上什么都没有」。
  详见 `docs/RUNBOOK.md` 的对应章节。

- **R\*Tree 只接受整数。** 经纬度必须乘以 `COORD_SCALE` 取整。粗筛会**多**返回少量边界点
  （bbox 外 ±11 m），由第二段浮点比较剔除。宁可多查一次，不可漏掉边界上的地点。

- **SQLite 不支持 `AFTER UPDATE OF col`。** 迁移中用的是不带 `OF` 子句的 `AFTER UPDATE`，
  加上 `OF` 会直接语法错误。

## 4. 与原方案的差异

| 能力           | 原方案（PostgreSQL）                        | 当前方案（SQLite）                                         |
| -------------- | ------------------------------------------- | ---------------------------------------------------------- |
| 空间索引       | PostGIS `geography(Point,4326)` + GiST      | R\*Tree 虚表 + `lon/lat` REAL                              |
| bbox 查询      | `ST_Intersects(geom, ST_MakeEnvelope(...))` | R\*Tree 粗筛 + 浮点精确判定                                |
| 主键           | UUID + pgcrypto                             | `cuid()`                                                   |
| email 规范化   | citext                                      | String + 应用层 `toLowerCase`                              |
| enum           | 原生 ENUM                                   | String + `packages/database/src/enums.ts` 字面量联合 + zod |
| 中文搜索相似度 | `pg_trgm`                                   | `LIKE` + 通配符转义（无相似度）                            |
| 备份           | 每日备份 + PITR                             | 文件级备份（`.backup` / `VACUUM INTO`），无 PITR           |
| 连接池指标     | DB pool                                     | 无连接池概念（见 `docs/OPERATIONS.md`）                    |

## 5. 后果与必须接受的限制

1. **无 PITR。** SQLite 不支持时间点恢复。备份与恢复流程改为
   `.backup` 或 `VACUUM INTO`，并接受「RPO = 距上次备份的间隔」。
   已写入 `docs/RUNBOOK.md` 与 `docs/OPERATIONS.md`。

2. **不能部署到无持久卷的 serverless 平台。** `DATABASE_URL` 指向本地文件，
   serverless 文件系统是临时的，部署会丢数据。API 必须部署在带持久卷的长驻主机上。
   换数据库属于新的架构变更，需要新的 ADR 与人工批准。

3. **写入并发受限。** SQLite 单写者。适合本项目「编辑人员低并发」的实际负载，
   但不适合高写入量场景。届时的处理同样需要新 ADR。

4. **中文搜索能力弱于原方案。** 没有 trigram 相似度，排序只能按命中字段与发布时间。
   若实测不满足需求，再按 `docs/TECHNICAL_IMPLEMENTATION.md` §11 的升级路径单独决策。

## 6. 不受本决策影响的约束

以下 `AGENTS.md` 硬约束**全部继续有效**，SQLite 方案不构成任何豁免：

- §3 内容可信度：不得编造历史、坐标、来源、版权；未核实坐标不得画精确点。
- §4 安全与权限：写操作仍需服务端鉴权、授权、DTO 白名单、审计。
- §5.3 事务一致性、§5.4 revision / review action / audit log 只增不改、
  §5.5 乐观锁与 409 冲突。
- §5.7 破坏性迁移的 expand/contract 与人工批准。
- §7 测试要求：集成测试仍须跑**真实数据库**（现在是真实 SQLite 库，不是内存 mock）。

## 7. 未包含在本 ADR 中的事项

- **底图供应商**：代码当前使用高德地图 JS API 2.0。该变更的 ADR **尚未获得批准**，
  技术方案 §2 的「Leaflet」一项也尚未回写。本 ADR 不涉及、不认可、不代替该 ADR。
  见 `README.md`「当前状态」中的说明。

## 8. 受本 ADR 取代的文档表述

以下文档原先写有 PostgreSQL/PostGIS，已按本决策同步修订：

- `AGENTS.md` §2.1、§5.2、§7.1
- `docs/TECHNICAL_IMPLEMENTATION.md` §1、§2、§4、§5.2、§5.3、§11、§13、§16、§18、§19
- `docs/IMPLEMENTATION_BACKLOG.md` P1-01、P3-01、P3-05
- `docs/MINIMAX_IMPLEMENTATION_GUIDE.md` §3、§4.3、§11、§12
- `docs/PRODUCT_REQUIREMENTS.md` §3.1、§6.1、§8、§15
- `README.md` 阶段门禁
