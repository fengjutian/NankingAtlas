import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="shell" aria-labelledby="home-title">
      <header>
        <h1 id="home-title" style={{ fontFamily: 'var(--app-font-serif)', fontSize: '2.25rem' }}>
          金陵风物志
        </h1>
        <p className="muted">Nanking Atlas · 南京城市文化数字档案与互动街巷地图</p>
      </header>

      <section
        className="banner"
        role="status"
        aria-label="在建状态提示"
        style={{ marginTop: 'var(--app-space-lg)' }}
      >
        <strong>示例 / 待核验</strong> · 当前为 P0 工程骨架占位页，业务内容将在后续阶段上线。
        页面所示品牌、栏目与文案仅为设计参考，不构成已发布事实。
      </section>

      <section style={{ marginTop: 'var(--app-space-lg)' }}>
        <h2 style={{ fontSize: '1.25rem' }}>已构建的能力</h2>
        <ul>
          <li>公开站 Next.js 应用可独立 build / dev / test</li>
          <li>App Router 页面 shell：顶部导航、首页、404、错误、加载态、底部</li>
          <li>响应式导航：桌面端横向链接，移动端汉堡折叠</li>
          <li>共享 design tokens（颜色、字体、间距）跨 web/admin 一致</li>
          <li>环境变量启服端校验（缺关键变量立即失败）</li>
          <li>strict TypeScript、共享 ESLint 规则、跨包依赖边界</li>
        </ul>

        <h2 style={{ fontSize: '1.25rem', marginTop: 'var(--app-space-lg)' }}>尚不可用</h2>
        <ul>
          <li>任何历史内容、地点、人物、事件、专题、路线详情（P2 阶段）</li>
          <li>地图视图、bbox 查询、底图加载与降级（P3 阶段）</li>
          <li>登录、投稿、纠错入口（依赖 API P1 阶段交付）</li>
        </ul>
      </section>

      <footer style={{ marginTop: 'var(--app-space-xxl)', fontSize: '0.85rem' }} className="muted">
        <p>
          本页不索引、不被搜索引擎收录。完整{' '}
          <Link href="https://github.com/" rel="noopener noreferrer">
            项目说明
          </Link>{' '}
          请参考仓库根目录的 README 与 docs/。
        </p>
      </footer>
    </div>
  );
}
