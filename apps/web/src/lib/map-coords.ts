/**
 * 坐标系转换（P3-02）。
 *
 * ## 为什么需要
 *
 * 数据库里存的经纬度是 **WGS-84**（GPS 原始坐标，R*Tree 索引、
 * 来源标注、JSON-LD 都用它）。而高德地图 JS API 用的是 **GCJ-02**
 * （"火星坐标"，中国法定测绘坐标系）。
 *
 * 两者在中国境内相差 **100 ~ 500 米**（南京一带约 300 米）。直接把
 * WGS-84 丢给高德显示，marker 会整体偏移半条街 —— 用户点导航会走错路。
 *
 * 所以：**只在"送给高德渲染"的那一步转换**，库里永远存 WGS-84。
 * 反向（GCJ-02 → WGS-84）用于把用户点击/拖拽得到的坐标写回业务层。
 *
 * ## 算法
 *
 * 经典的"加密偏移"算法（GCJ-02）：
 *   1. `transformLat/transformLng` —— 经验多项式 + 三角函数的粗偏移
 *   2. 按椭球参数（克拉索夫斯基椭球）把粗偏移的**单位从米换成度**
 *      —— 这一步是整个算法里最容易写错的地方
 *
 * ⚠️ 这是公开逆向的近似算法，官方未公布精确参数。
 * 对**展示级精度**（米级）足够；**不能用于测绘**。
 *
 * 境外坐标不做转换（GCJ-02 只在中国境内定义）。
 */

import type { LonLat } from './map-geo';

/**
 * 坐标点。
 *
 * 刻意复用 `map-geo.ts` 的 `LonLat`（`lon`/`lat`），而不是另起一套
 * `LngLat`/`lat`：本仓库所有经纬度（API 出参、bbox、marker 落点）
 * 都是这个形状，多一份同构类型就多一处"传错字段"的静默偏移风险。
 * 高德 SDK 自己的 `lng`/`lat` 形状由 `amap-sdk.ts` 独立描述。
 */
export type { LonLat };

/**
 * 中国境外粗略边界。
 *
 * 注意：坊间流传的 GCJ-02 实现常用 `minLng = 72.004 / minLat = 0.8293`
 * （新疆西部与南海诸礁的实际测绘管辖范围）。这里**故意收紧**到
 * 73.66 / 3.86 —— 那套边界会把南海和西部无人区一起框进来，而本项目
 * 只做南京一城，用一个贴着实际行政区范围的框更安全：边界外一律
 * 不转换（宁可不转，也不要给境外坐标加一个伪造偏移）。
 *
 * ⚠️ 矩形边界法的**已知局限**：GCJ-02 规范只覆盖大陆与港澳，不含台湾，
 * 但矩形框无法"只框大陆"，因此台北会被一并转换。所有公开实现都是如此。
 * 本项目只做南京一城，永远碰不到这个分支；`map-coords.test.ts` 里有一条
 * 测试把该局限显式钉住，避免将来有人以为它没被考虑过。
 */
const OUTSIDE_CHINA = {
  minLng: 73.66,
  maxLng: 135.05,
  minLat: 3.86,
  maxLat: 53.55,
} as const;

const PI = Math.PI;
const A = 6378245.0; // 克拉索夫斯基椭球长半轴
// 第一偏心率平方。字面量写全 20 位是官方算法里的写法，JS double 只有
// 53 位尾数，写全与截断到 17 位的运行时结果完全相同 —— 用后者是为了
// 满足 `no-loss-of-precision`（该规则拦截的是"字面量超过 double 精度"）。
const EE = 0.006693421622965943;

function outsideChina(lng: number, lat: number): boolean {
  return (
    lng < OUTSIDE_CHINA.minLng ||
    lng > OUTSIDE_CHINA.maxLng ||
    lat < OUTSIDE_CHINA.minLat ||
    lat > OUTSIDE_CHINA.maxLat
  );
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * WGS-84 → GCJ-02 的偏移量（单位：**度**）。
 *
 * 第一步 `transformLat/transformLng` 得到的是**米**级的粗偏移量，
 * 必须按当地纬度的椭球子午/卯酉曲率半径换算成角度，才是真正能加到
 * 经纬度上的值：
 *
 * ```
 * magic   = 1 - ee·sin²φ              （子午/卯酉曲率的公共修正）
 * dLat(度) = transformLat · 180 / ( (a(1-ee)) / (magic·√magic) · π )
 * dLon(度) = transformLng · 180 / ( a / √magic · cosφ · π )
 * ```
 *
 * ⚠️ 漏掉这一步（或把 `magic·√magic` 与 `1/magic·√magic` 写反），
 * 结果仍然是"看起来合理的小偏移"，但量级差好几倍 —— 天安门锚点会
 * 从 116.4037 漂到 116.3860。**不会报错，只会静默偏 1.7 公里。**
 */
function delta(lng: number, lat: number): { dLat: number; dLon: number } {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLon = transformLng(lng - 105.0, lat - 35.0);

  const radLat = (lat / 180.0) * PI;
  const sinLat = Math.sin(radLat);
  const magic = 1 - EE * sinLat * sinLat;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);

  return { dLat, dLon };
}

/**
 * WGS-84 → GCJ-02（高德/腾讯通用的"火星坐标"）。
 *
 * 中国境外原样返回。
 */
export function wgs84ToGcj02(point: LonLat): LonLat {
  const { lon, lat } = point;
  if (outsideChina(lon, lat)) {
    return { lon, lat };
  }
  const { dLat, dLon } = delta(lon, lat);
  return { lon: lon + dLon, lat: lat + dLat };
}

/**
 * GCJ-02 → WGS-84（高德坐标还原为 GPS 原始坐标）。
 *
 * 官方算法不可逆，这里用**不动点迭代逼近**：
 * 以当前 `wgs` 为假设做一次正向转换，若结果等于输入的 GCJ-02 坐标，
 * 则 `wgs` 就是答案；否则用两者的差值继续修正。3 次即可收敛到亚米级。
 */
export function gcj02ToWgs84(point: LonLat): LonLat {
  const { lon, lat } = point;
  if (outsideChina(lon, lat)) {
    return { lon, lat };
  }
  let wgs: LonLat = { lon, lat };
  for (let i = 0; i < 5; i += 1) {
    const forward = wgs84ToGcj02(wgs);
    const errLon = forward.lon - lon;
    const errLat = forward.lat - lat;
    if (Math.abs(errLon) < 1e-9 && Math.abs(errLat) < 1e-9) break;
    wgs = { lon: wgs.lon - errLon, lat: wgs.lat - errLat };
  }
  return wgs;
}

/**
 * 经纬度是否合法。
 *
 * 用来挡住上游传来的脏数据（字符串 / null / NaN / 越界），
 * 在送进高德 SDK 之前拦掉。
 */
export function isValidLngLat(value: unknown): value is LonLat {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as { lon?: unknown; lat?: unknown };
  const { lon, lat } = rec;
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}
