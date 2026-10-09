import { useSyncExternalStore } from 'react';

/**
 * 极简 history 路由（不装 react-router）。
 *
 * 理由：AGENTS.md §6.5「能用现有依赖解决时不新增依赖」。后台只有 3 条路由
 * （登录 / 内容列表 / 内容编辑），用 `pushState` + `useSyncExternalStore` 足够，
 * 且避免引入 ~20KB 的路由库与一份需要维护的依赖许可说明。
 *
 * 真实实现路径：`/login`、`/contents`、`/contents/:id`。
 */

export type Route =
  | { name: 'login' }
  | { name: 'contents' }
  | { name: 'editor'; contentId: string };

const listeners = new Set<() => void>();

function snapshot(): string {
  return window.location.pathname;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

window.addEventListener('popstate', () => {
  for (const listener of listeners) {
    listener();
  }
});

export function navigate(path: string): void {
  if (window.location.pathname === path) {
    return;
  }
  window.history.pushState({}, '', path);
  for (const listener of listeners) {
    listener();
  }
}

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/login') {
    return { name: 'login' };
  }
  const editorMatch = /^\/contents\/([^/]+)$/.exec(path);
  const contentId = editorMatch?.[1];
  if (contentId !== undefined && contentId !== '') {
    return { name: 'editor', contentId: decodeURIComponent(contentId) };
  }
  // 未知路径回落到内容列表，不给 404 页（后台是应用式界面）。
  return { name: 'contents' };
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, snapshot, snapshot);
  return parseRoute(pathname);
}
