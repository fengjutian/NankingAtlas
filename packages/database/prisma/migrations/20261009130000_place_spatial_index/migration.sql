-- 地点空间索引（P3-01）。
--
-- 技术方案 §7.2 要求公开接口 `GET /places?bbox=` 做矩形范围查询。
-- 项目数据层是 SQLite（用户决策，见 README「与 PostgreSQL 版本的功能差异」），
-- 没有 PostGIS，改用 SQLite 内置的 **R*Tree** 虚表做空间索引。
--
-- R*Tree 虚表的特点：
--   - 是虚表（内容存于普通表，由索引自动同步）
--   - 只能声明整型 id + 坐标；小数坐标取整放大
--   - 不支持 ON CONFLICT，不可用普通 INSERT/UPDATE 改内容
--
-- 坐标放大因子：经纬度各 × 10000（约 11 m 精度）。
-- 南京城区跨度约 0.5°，×10000 后是 5000，取整误差远小于城区尺度。
--
-- 精确坐标仍以 places.lon / places.lat（REAL）为准；
-- 本索引只用于"是否落在 bbox 内"的粗筛，最终判定在应用层用浮点比较
-- （避免放大取整把边界点误判为命中或漏判）。
--
-- 回滚：DROP TABLE places_rtree;（不动 places 表数据，安全）

CREATE VIRTUAL TABLE places_rtree USING rtree(
  id,              -- places.content_id 的整数映射
  min_lon, max_lon,
  min_lat, max_lat
);

-- R*Tree 需要一个整数主键，而 places.content_id 是文本 cuid。
-- 建映射表：rid INTEGER PRIMARY KEY AUTOINCREMENT ←→ content_id TEXT UNIQUE。
-- API 查询时先经映射拿到 rid 区间，或直接 join 回 content_id。

CREATE TABLE place_rtree_ids (
  rid INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL UNIQUE,
  lon REAL,
  lat REAL
);

CREATE INDEX place_rtree_ids_content_id_idx ON place_rtree_ids(content_id);

-- 同步：应用层在 places 写入/更新坐标后调用，重建对应条目。
--
-- 用 AFTER UPDATE（不带 `OF` 子句）：SQLite **不支持** `AFTER UPDATE OF col1, col2`
-- （只有 AFTER UPDATE ... WHEN 支持部分条件），写了会直接报语法错。
-- 因此这里对所有 UPDATE 都同步 —— places 的写路径只有 Prisma，代价可忽略。
--
-- 注：SQLite 触发器里不能直接写虚表（限制），所以这里只维护
-- place_rtree_ids 映射表，rtree 的刷新由应用层的 rebuildPlaceIndex() 负责。
-- 这是 SQLite R*Tree 的常见用法：虚表由应用显式 refresh，普通表由触发器兜底。
CREATE TRIGGER places_ai AFTER INSERT ON places
BEGIN
  INSERT INTO place_rtree_ids(content_id, lon, lat)
  VALUES (NEW.content_id, NEW.lon, NEW.lat);
END;

CREATE TRIGGER places_au AFTER UPDATE ON places
BEGIN
  INSERT INTO place_rtree_ids(content_id, lon, lat)
  VALUES (NEW.content_id, NEW.lon, NEW.lat)
  ON CONFLICT(content_id) DO UPDATE SET lon = excluded.lon, lat = excluded.lat;
END;

CREATE TRIGGER places_ad AFTER DELETE ON places
BEGIN
  DELETE FROM place_rtree_ids WHERE content_id = OLD.content_id;
END;