'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** 详情页局部错误边界：不显示堆栈，只给重试与回退路径。 */
export default function ChronicleDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[web] /chronicle/[slug] render failed', error);
  }, [error]);

  return (
    <div className="shell" aria-labelledby="chronicle-error-title">
      <h1 id="chronicle-error-title">内容暂时无法显示</h1>
      <p className="muted">
        渲染该条目时发生错误。服务端不会返回堆栈或内部路径；你可以重试，或回到列表查看其他内容。
      </p>
      <p className="error-actions">
        <button type="button" className="btn btn--primary" onClick={reset}>
          重试
        </button>{' '}
        <Link href={'/chronicle'}>返回文化志</Link>
      </p>
    </div>
  );
}
