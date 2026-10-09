'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // P0 阶段仅打印到控制台，生产应交给遥测/日志服务
    console.error('[web] unhandled error', error);
  }, [error]);

  return (
    <main className="shell" aria-labelledby="err-title">
      <h1 id="err-title">页面出错了</h1>
      <p style={{ color: 'var(--color-muted)' }}>
        服务端尚未返回堆栈或内部路径。如反复出现，请稍后重试或反馈管理员。
      </p>
      <p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          重试
        </button>
        {' '}
        <Link href="/">返回首页</Link>
      </p>
    </main>
  );
}