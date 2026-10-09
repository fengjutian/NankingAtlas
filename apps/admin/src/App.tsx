import { AdminShell } from './components/AdminShell';

export function App() {
  return (
    <AdminShell>
      <header>
        <h1 id="dashboard-title" style={{ fontSize: '1.5rem', margin: 0 }}>
          仪表盘
        </h1>
        <p className="muted" style={{ marginTop: 'var(--app-space-xs)' }}>
          Nanking Atlas Admin · 当前环境：等待 P1 接入真实数据
        </p>
      </header>

      <section className="banner" role="status" aria-label="在建状态提示">
        <strong>示例 / 待核验</strong> · 当前为 P0
        工程骨架占位页。登录、内容编辑、审核、媒体上传等功能将在 P1 阶段交付。
      </section>

      <section style={{ marginTop: 'var(--app-space-lg)' }}>
        <h2 style={{ fontSize: '1.15rem' }}>已构建的能力</h2>
        <ul>
          <li>Vite + React 18 应用可独立 dev / build / preview / test</li>
          <li>管理后台 shell：顶栏 + 侧边导航（响应式，移动端汉堡折叠）</li>
          <li>共享 design tokens（颜色、字体、间距）跨 web/admin 一致</li>
          <li>启服端环境变量校验（缺关键变量立即失败）</li>
          <li>strict TypeScript、共享 ESLint 规则、跨包依赖边界</li>
        </ul>

        <h2 style={{ fontSize: '1.15rem', marginTop: 'var(--app-space-lg)' }}>尚不可用</h2>
        <ul>
          <li>登录、用户、角色管理（API P1）</li>
          <li>内容/来源/媒体编辑器与审核界面（API P1）</li>
          <li>OpenAPI 生成客户端（API P1）</li>
        </ul>
      </section>
    </AdminShell>
  );
}
