'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './map.module.css';
import { MapErrorBoundary } from './MapErrorBoundary';
import { MapToolbar } from './MapToolbar';
import { PlaceList } from './PlaceList';

import type { ApiFailure } from '@/lib/api';
import type { MapPlaceResult } from '@/lib/map-data';
import type { BBoxErrorCode, MapBBox } from '@/lib/map-geo';
import type { MapQuery } from '@/lib/map-url';

import { areaOnlyNote, requestPlacesInBBox } from '@/lib/map-data';
import { MAP_RESULT_LIMIT, bboxErrorMessage, validateBBox } from '@/lib/map-geo';
import {
  createLatestRequest,
  isRegionError,
  mapSurfaceMessage,
  regionMessage,
  regionStateFromFailure,
  resolveSelectionTarget,
  toggleSelection,
  type LatestRequest,
  type MapSurfaceState,
  type RegionState,
} from '@/lib/map-state';
import { serializeMapQuery, setMapSelection, withMapQuery } from '@/lib/map-url';

/** CSS Module 取值（`noUncheckedIndexedAccess` 下取值是 `string | undefined`）。 */
function css(name: string): string {
  return styles[name] ?? name;
}

/**
 * 地图页的交互外壳（P3-02 ~ P3-04、P3-07）。
 *
 * 由服务端 `app/map/page.tsx` 以首屏结果（`initialPlaces` / `initialFailure`）驱动，
 * 因此**列表与筛选在首屏 HTML 里就存在** —— Leaflet 是延迟加载的增强块，
 * 地图脚本、瓦片、容器任一失败都不会影响列表（技术方案 §9.2 前两条）。
 *
 * `baseUrl` 由服务端从 `env.API_BASE_URL` 注入：客户端不读 `lib/env.ts`
 * （它 fail-fast 且依赖 node:crypto），未配置时直接走 `unconfigured` 降级。
 */
export interface MapExplorerProps {
  readonly baseUrl: string | null;
  readonly initialBBox: MapBBox;
  readonly initialQuery: MapQuery;
  readonly initialPlaces: MapPlaceResult | null;
  readonly initialFailure: ApiFailure | null;
  /** URL 里的 `bbox` 非法时的错误码（合法则为 null）。 */
  readonly initialBBoxError: BBoxErrorCode | null;
}

const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className={css('mapPlaceholder')} role="status" aria-live="polite">
      <p>正在加载交互地图……地点列表与筛选已可先行使用。</p>
      <div className={css('mapPlaceholderBar')} />
    </div>
  ),
});

export function MapExplorer({
  baseUrl,
  initialBBox,
  initialQuery,
  initialPlaces,
  initialFailure,
  initialBBoxError,
}: MapExplorerProps) {
  const router = useRouter();
  const serverKey = useMemo(() => serializeMapQuery(initialQuery), [initialQuery]);

  const [places, setPlaces] = useState<MapPlaceResult | null>(initialPlaces);
  const [failure, setFailure] = useState<ApiFailure | null>(initialFailure);
  const [selected, setSelected] = useState<string | null>(initialQuery.selected);
  const [loading, setLoading] = useState(false);
  const [surface, setSurface] = useState<MapSurfaceState>('loading');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [regionState, setRegionState] = useState<RegionState>(() => initialRegionState());

  const latestRef = useRef<LatestRequest | null>(null);
  latestRef.current ??= createLatestRequest();
  const appliedServerKeyRef = useRef(serverKey);

  function initialRegionState(): RegionState {
    if (initialBBoxError !== null) return 'invalid_bbox';
    return initialFailure === null ? 'ready' : regionStateFromFailure(initialFailure);
  }

  // 尊重 prefers-reduced-motion（§9.3）。只在客户端读取，SSR 恒为 false。
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent): void => setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // 服务端筛选变化（表单提交 / 分享链接跳转）→ 用新的首屏结果覆盖本地状态。
  useEffect(() => {
    if (serverKey === appliedServerKeyRef.current) return;
    appliedServerKeyRef.current = serverKey;
    setPlaces(initialPlaces);
    setFailure(initialFailure);
    setSelected(initialQuery.selected);
    if (initialBBoxError !== null) {
      setRegionState('invalid_bbox');
      return;
    }
    setRegionState(initialFailure === null ? 'ready' : regionStateFromFailure(initialFailure));
  }, [serverKey, initialPlaces, initialFailure, initialBBoxError, initialQuery.selected]);

  // 组件卸载：中止在途请求，避免把响应写进已卸载的组件。
  useEffect(() => {
    const latest = latestRef.current;
    return () => latest?.dispose();
  }, []);

  const loadBBox = useCallback(
    async (bbox: MapBBox): Promise<void> => {
      const latest = latestRef.current;
      if (latest === null) return;

      // 先在客户端挡掉非法窗口：能打出的请求就不会注定 400。
      if (!validateBBox(bbox).ok) {
        setRegionState('invalid_bbox');
        setLoading(false);
        return;
      }

      // begin() 会中止上一个请求；只有 isCurrent 的响应才允许写回状态。
      const signal = latest.begin();
      setLoading(true);
      const result = await requestPlacesInBBox({
        baseUrl,
        bbox,
        ...(initialQuery.type === null ? {} : { type: initialQuery.type }),
        ...(initialQuery.q === '' ? {} : { q: initialQuery.q }),
        limit: MAP_RESULT_LIMIT,
        signal,
      });
      if (!latest.isCurrent(signal)) return; // 过期响应：直接丢弃
      latest.settle(signal);
      setLoading(false);

      if (result.ok) {
        setPlaces(result.data);
        setFailure(null);
        setRegionState('ready');
        return;
      }
      setFailure(result);
      setRegionState(regionStateFromFailure(result));
    },
    [baseUrl, initialQuery.type, initialQuery.q],
  );

  const handleSelect = useCallback(
    (slug: string): void => {
      setSelected((current) => {
        const next = toggleSelection(current, slug);
        // 选中态进 URL，刷新/分享可还原（§9.2 第 3 条）。scroll:false 避免视口跳动。
        void router.replace(withMapQuery('/map', setMapSelection(initialQuery, next)), {
          scroll: false,
        });
        return next;
      });
    },
    [initialQuery, router],
  );

  const items = places?.items ?? [];
  const selectionTarget = resolveSelectionTarget(items, selected, areaOnlyNote);
  const areaOnlyMessage = selectionTarget?.kind === 'area-only' ? selectionTarget.note : null;
  const regionText = regionMessage(regionState, failure);
  const surfaceText = mapSurfaceMessage(surface);

  return (
    <div className="mapLayout">
      <section aria-labelledby="map-pane-title" className="mapPane">
        <h2 id="map-pane-title" className={css('visuallyHidden')}>
          交互地图
        </h2>
        <MapErrorBoundary onRetry={() => setMapAttempt((value) => value + 1)}>
          <div role="application" aria-label="南京地点交互地图">
            <MapCanvas
              key={mapAttempt}
              items={items}
              selected={selected}
              initialBBox={initialBBox}
              onViewportChange={(bbox) => void loadBBox(bbox)}
              onSelect={handleSelect}
              onSurfaceState={setSurface}
              reducedMotion={reducedMotion}
            />
          </div>
        </MapErrorBoundary>

        {surfaceText === '' ? null : (
          <p className={css('mapNotice')} role="status">
            {surfaceText}
          </p>
        )}
      </section>

      <div className={css('mapListRegion')}>
        <MapToolbar basePath="/map" query={initialQuery} allowedTypes={['PLACE']} />

        <ul className={css('mapLegend')} role="list">
          <li>底图：OpenStreetMap（署名见地图右下角）</li>
          <li>仅核验通过的地点显示精确点位</li>
          <li>仅区域级 / 未核验位置只显示说明</li>
        </ul>

        {initialBBoxError === null ? null : (
          <p className={css('mapNotice')} role="alert">
            地址栏中的范围参数无法使用：{bboxErrorMessage(initialBBoxError)}已改用默认范围。
          </p>
        )}

        {loading ? (
          <p className="list-summary" aria-live="polite">
            正在读取当前地图范围内的地点……
          </p>
        ) : null}

        {isRegionError(regionState) && regionText !== '' ? (
          <p className={css('mapNotice')} role="alert">
            {regionText}
          </p>
        ) : null}

        {areaOnlyMessage === null ? null : (
          <p className={css('mapNotice')} role="status">
            该地点没有可展示的精确点位：{areaOnlyMessage}
          </p>
        )}

        {items.length > 0 ? (
          <>
            <p className="list-summary" aria-live="polite">
              当前范围内共 {places?.total ?? items.length} 条地点
              {places?.truncated === true ? '（已截断，缩小范围可看到更多）' : ''}。
            </p>
            <PlaceList items={items} selected={selected} onSelect={handleSelect} />
          </>
        ) : (
          <div className="empty-state" role="status">
            <h2 className="empty-state__title">当前范围内没有地点</h2>
            <p className="empty-state__desc">
              {regionState === 'ready'
                ? '本站坚持"来源与核验通过才发布"。该范围内暂无符合条件、或已核验坐标的地点。可以缩小地图范围或调整关键词再试。'
                : '地点数据暂时无法读取，但筛选、搜索与详情链接仍可正常使用。'}
            </p>
            <ul className="empty-state__actions" role="list">
              <li>
                <Link href="/map" className="btn">
                  清除筛选条件
                </Link>
              </li>
              <li>
                <Link href="/search" className="btn">
                  前往全站检索
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
