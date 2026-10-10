import type { Metadata } from 'next';

import { MapExplorer } from '@/components/map/MapExplorer';
import { env } from '@/lib/env';
import { requestPlacesInBBox } from '@/lib/map-data';
import { MAP_RESULT_LIMIT } from '@/lib/map-geo';
import { firstMapParam, parseMapQuery, resolveInitialBBox } from '@/lib/map-url';
import { buildPageMetadata, truncateDescription } from '@/lib/seo';

const BASE_PATH = '/map';
const DESCRIPTION =
  '按地图范围浏览已核验的南京地点档案。列表先于地图加载，底图或接口不可用时筛选、列表与详情链接仍然可用。';

export const metadata: Metadata = buildPageMetadata({
  title: '南京地点地图',
  description: DESCRIPTION,
  path: BASE_PATH,
});

// 地图页读 URL 参数（筛选/选中/bbox）并按当前视窗取数，必须每次请求都渲染。
export const dynamic = 'force-dynamic';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseMapQuery(params);
  // 这里读**原始**参数而不是 `query.bbox`：`parseMapQuery` 会把非法 bbox 静默
  // 归一化成 null（坏链接不能进表单回显），若据此解析就再也拿不到错误码，
  // §9.2「提示缩小范围」就会静默失效。
  const { bbox, errorCode } = resolveInitialBBox(firstMapParam(params.bbox));

  // `env.API_BASE_URL` 为 null 时这里返回 `unconfigured`，页面走降级分支，
  // 绝不用硬编码 localhost 假装接口可用（与 `lib/api.ts` 同一约定）。
  const result = await requestPlacesInBBox({
    baseUrl: env.API_BASE_URL,
    bbox,
    ...(query.type === null ? {} : { type: query.type }),
    ...(query.q === '' ? {} : { q: query.q }),
    limit: MAP_RESULT_LIMIT,
  });

  // 底图已改为 OSM 瓦片（ADR-0003），不再依赖高德 Key；
  // 高德只用于地址检索，缺 Key 时由 `lib/geocode.ts` 自行降级。

  return (
    <div className="shell">
      <header className="page-header">
        <h1 className="page-header__title">南京地点地图</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 90)}</p>
      </header>

      <MapExplorer
        baseUrl={env.API_BASE_URL}
        mapEnabled
        initialBBox={bbox}
        initialQuery={query}
        initialPlaces={result.ok ? result.data : null}
        initialFailure={result.ok ? null : result}
        initialBBoxError={errorCode}
      />

      <p className="muted home-section__note">
        坐标未核验或仅有区域级位置的条目不显示精确点位，只在列表中给出说明。底图由高德地图提供，
        站点存储的原始坐标为 WGS-84，仅在渲染时转换为 GCJ-02。上线前须在高德开放平台为本域名申请 Key
        并配置域名白名单与配额（技术方案 §19「底图供应商 ADR」仍待维护者确认）。
      </p>
    </div>
  );
}
