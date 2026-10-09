import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="shell" aria-labelledby="nf-title">
      <h1 id="nf-title">页面未找到</h1>
      <p style={{ color: 'var(--color-muted)' }}>抱歉，所请求的资源不存在或尚未上线。</p>
      <p>
        <Link href="/">返回首页</Link>
      </p>
    </main>
  );
}
