'use client';

import { useCallback, useId, useRef, useState } from 'react';

import styles from './map.module.css';

import type { GeocodeResult } from '@/lib/geocode';

import { geocodeAddress } from '@/lib/geocode';

/**
 * 地址检索（ADR-0003：高德提供数据的唯一入口）。
 *
 * 这是整个项目里**高德真正被用到的功能**：渲染由 Leaflet 负责，
 * 高德只在这里负责把用户输入的地址变成坐标。拿到坐标后交给上层
 * 平移地图并按新 bbox 重新取数，不在这里直接改地图。
 *
 * ## 三条必须满足的规则
 *
 * 1. **缺 Key 时不能拖累地图。** 未配置高德 Key 时这里显示"不可用"，
 *    地图与列表照常工作（技术方案 §9.2：地图是增强，不是前提）。
 * 2. **失败文案要说人话。** 区分「没配 Key」与「没查到」——
 *    前者是运维问题，后者是用户输入问题，处理方式完全不同。
 * 3. **不得伪造结果。** 地理编码失败时绝不返回猜测坐标或近似值；
 *    高德查不到就是查不到（AGENTS.md §3.5 同一原则）。
 */

export interface AddressSearchProps {
  /** 限定城市，避免全国同名地点被误选。本项目只做南京。 */
  readonly city: string;
  /** 检索成功时回调（坐标已是 WGS-84）。 */
  readonly onLocated: (point: { readonly lon: number; readonly lat: number }) => void;
}

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failed'; readonly message: string; readonly unavailable: boolean };

export function AddressSearch({ city, onLocated }: AddressSearchProps) {
  const [value, setValue] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const inputId = useId();
  const statusId = useId();
  /** 连续提交时只认最后一次，防止先发的慢响应覆盖后发的结果。 */
  const requestSeq = useRef(0);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const address = value.trim();
      if (address === '') return;

      requestSeq.current += 1;
      const seq = requestSeq.current;
      setState({ kind: 'busy' });

      let result: GeocodeResult;
      try {
        result = await geocodeAddress(address, city);
      } catch {
        // geocodeAddress 内部已兜住预期失败；到这里说明是意外异常。
        // 仍然给用户一句话，而不是让未捕获异常冒泡把整块地图带走。
        result = { ok: false, reason: 'unavailable', message: '地址检索暂时不可用，请稍后再试。' };
      }
      if (seq !== requestSeq.current) return; // 过期响应：丢弃

      if (result.ok) {
        setState({ kind: 'idle' });
        onLocated(result.point);
        return;
      }
      setState({
        kind: 'failed',
        message: result.message,
        unavailable: result.reason === 'unavailable',
      });
    },
    [value, city, onLocated],
  );

  return (
    <form className={styles.addressSearch} onSubmit={(e) => void handleSubmit(e)}>
      <label className={styles.addressSearchLabel} htmlFor={inputId}>
        按地址定位
      </label>
      <div className={styles.addressSearchRow}>
        <input
          id={inputId}
          className={styles.addressSearchInput}
          type="search"
          value={value}
          placeholder="例如：夫子庙、总统府、中山北路"
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={statusId}
        />
        <button
          type="submit"
          className="btn"
          disabled={state.kind === 'busy' || value.trim() === ''}
        >
          {state.kind === 'busy' ? '检索中…' : '定位'}
        </button>
      </div>
      {/*
        状态区始终存在（而不是失败时才插入）：aria-live 区域若在内容出现的那一刻
        才挂载，部分读屏不会播报。空内容时也不显示视觉占位。
      */}
      <p className={styles.addressSearchStatus} id={statusId} role="status" aria-live="polite">
        {state.kind === 'failed'
          ? state.unavailable
            ? `${state.message}这不影响下方地图与地点列表的使用。`
            : state.message
          : ''}
      </p>
    </form>
  );
}
