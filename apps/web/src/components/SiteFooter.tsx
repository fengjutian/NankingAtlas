import Link from 'next/link';

/**
 * 公开站底部。仅展示"在建"占位 + 关键链接占位；实际内容待 P2 公开站阶段填充。
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <div className="site-footer__cols">
          <section aria-labelledby="footer-about-title">
            <h2 id="footer-about-title">关于</h2>
            <ul>
              <li>
                <Link href="/about">关于本项目</Link>
              </li>
              <li>
                <Link href="/sources">引用与版权</Link>
              </li>
            </ul>
          </section>

          <section aria-labelledby="footer-feedback-title">
            <h2 id="footer-feedback-title">反馈</h2>
            <ul>
              <li>
                <Link href="/about#feedback">纠错与建议</Link>
              </li>
            </ul>
          </section>
        </div>

        <p className="site-footer__notice">
          <strong>示例 / 待核验</strong> · 当前为 P0 工程骨架占位页，业务内容将在后续阶段上线。
          页面所示品牌、栏目与文案仅为设计参考，不构成已发布事实。
        </p>
        <p className="site-footer__copyright">
          © {year} Nanking Atlas Contributors · 本页不索引、不被搜索引擎收录
        </p>
      </div>
    </footer>
  );
}
