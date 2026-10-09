import { env } from './lib/env';

export function App() {
  return (
    <main className="shell" aria-labelledby="admin-title">
      <header>
        <h1 id="admin-title">金陵风物志 · 管理后台</h1>
        <p className="muted">Nanking Atlas Admin · 当前环境：{env.APP_ENV}</p>
      </header>

      <section className="banner" role="status" aria-label="在建状态提示">
        <strong>示例 / 待核验</strong> · 当前为 P0
        工程骨架占位页。登录、内容编辑、审核、媒体上传等功能将在 P1 阶段交付。
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>已构建的能力</h2>
        <ul>
          <li>Vite + React 18 应用可独立 dev / build / preview / test</li>
          <li>启服端环境变量校验（缺关键变量立即失败）</li>
          <li>strict TypeScript、共享 ESLint 规则与 Prettier 集成</li>
        </ul>

        <h2 style={{ marginTop: '1.5rem' }}>尚不可用</h2>
        <ul>
          <li>登录、用户、角色管理（API P1）</li>
          <li>内容/来源/媒体编辑器与审核界面（API P1）</li>
          <li>OpenAPI 生成客户端（API P1）</li>
        </ul>
      </section>
    </main>
  );
}
