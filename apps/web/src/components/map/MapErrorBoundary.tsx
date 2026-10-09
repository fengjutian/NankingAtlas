'use client';

import { Component } from 'react';

import styles from './map.module.css';

import type { ErrorInfo, ReactNode } from 'react';

/**
 * 地图块的错误边界（P3-02）。
 *
 * 为什么不用路由级 `error.tsx`：路由级边界会连**列表一起**替换掉，
 * 直接违反技术方案 §9.2「底图失败时显示明确提示，不隐藏列表」。
 * 这里把失败范围严格限制在地图容器内，列表永远在边界外面。
 */
export interface MapErrorBoundaryProps {
  readonly children: ReactNode;
  /** 重试：父组件用它换 `key` 重新挂载地图模块。 */
  readonly onRetry: () => void;
}

interface MapErrorBoundaryState {
  readonly failed: boolean;
}

export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  override state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 动态 import 失败（chunk 404、依赖被裁剪）与运行时异常都落到这里。
    // 只记录模块级信息，不含用户数据（AGENTS.md §4.7）。
    console.warn('[map] 交互地图加载失败，已降级为纯列表。', error.message, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.setState({ failed: false });
    this.props.onRetry();
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className={styles.mapNotice} role="alert">
        <p>
          交互地图加载失败（可能是网络受限或地图资源不可用）。下方的地点列表、筛选与详情链接
          仍可正常使用。
        </p>
        <div className={styles.mapNoticeActions}>
          <button type="button" className="btn" onClick={this.handleRetry}>
            重试加载地图
          </button>
        </div>
      </div>
    );
  }
}
