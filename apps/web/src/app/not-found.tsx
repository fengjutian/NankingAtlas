import Link from 'next/link';

import type { Route } from 'next';

export default function NotFound() {
  return (
    <div className="shell" aria-labelledby="nf-title">
      <h1 id="nf-title">页面未找到</h1>
      <p className="muted">
        抱歉，所请求的资源不存在、尚未发布，或已归档撤回。公开站只展示已发布且未归档的内容。
      </p>
      <ul role="list" className="error-actions">
        <li>
          <Link href={'/chronicle' as Route}>浏览文化志</Link>
        </li>
        <li>
          <Link href={'/living' as Route}>浏览生活录</Link>
        </li>
        <li>
          <Link href={'/search' as Route}>全站检索</Link>
        </li>
        <li>
          <Link href={'/' as Route}>返回首页</Link>
        </li>
      </ul>
    </div>
  );
}
