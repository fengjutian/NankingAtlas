import Link from 'next/link';

/**
 * 必须按请求渲染，否则 CSP nonce 对不上。
 *
 * `/_not-found` 默认在 `next build` 期间预渲染，构建期还没有请求，
 * middleware 无 `x-nonce` 可透传 —— 于是 Next 把一个**构建期 nonce**
 * 烘进了 HTML 的内联 bootstrap script。运行时 middleware 发的是另一个
 * 每请求随机的 nonce，两者对不上，404 页上的所有 script 都会被拦。
 *
 * 与 `app/page.tsx` / `app/sources/page.tsx` 同因同解。
 */
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="shell" aria-labelledby="nf-title">
      <h1 id="nf-title">页面未找到</h1>
      <p className="muted">
        抱歉，所请求的资源不存在、尚未发布，或已归档撤回。公开站只展示已发布且未归档的内容。
      </p>
      <ul role="list" className="error-actions">
        <li>
          <Link href={'/chronicle'}>浏览文化志</Link>
        </li>
        <li>
          <Link href={'/living'}>浏览生活录</Link>
        </li>
        <li>
          <Link href={'/search'}>全站检索</Link>
        </li>
        <li>
          <Link href={'/'}>返回首页</Link>
        </li>
      </ul>
    </div>
  );
}
