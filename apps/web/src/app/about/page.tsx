import Link from 'next/link';

import type { Metadata } from 'next';

import { buildPageMetadata, truncateDescription } from '@/lib/seo';

const BASE_PATH = '/about';
const DESCRIPTION =
  '金陵风物志是什么、我们如何收录与核验、坐标如何标注，以及如何提交纠错与建议。本站坚持来源与核验通过才发布。';

export const metadata: Metadata = buildPageMetadata({
  title: '关于本项目',
  description: DESCRIPTION,
  path: BASE_PATH,
});

/**
 * 必须按请求渲染，否则 CSP nonce 对不上。
 *
 * 静态预渲染发生在 `next build` 期间 —— 那时没有请求，middleware 无从透传
 * nonce，Next 因此输出**不带 nonce 属性**的内联 bootstrap script；运行时
 * middleware 又发一个每请求随机的 nonce，两边永远对不上。而
 * `script-src` 同时含 nonce 与 `'strict-dynamic'` 时，页面上**所有** script
 * （内联与同源外链 alike）都会被浏览器拦掉：HTML 看着正常，整页无 JS、无水合，
 * 且应用层不抛任何异常。
 *
 * 详见 `app/sources/page.tsx` 的同款注释与 `src/security-headers.ts`。
 */
export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <div className="shell prose-page">
      <header className="page-header">
        <h1 className="page-header__title">关于本项目</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 100)}</p>
      </header>

      <section aria-labelledby="about-what">
        <h2 id="about-what">这是什么</h2>
        <p>
          金陵风物志是一座面向所有人的南京城市文化数字档案。它把散落在方志、别集、
          档案与当代记录里的线索整理成可核验的条目：以人物、事件、建筑与民俗为线索的长文，
          以街巷、节令、饮食与日常为线索的生活记录，以及一张可交互的地点地图。
        </p>
        <p>
          我们把它做成公开档案而不是内容农场，理由只有一个：
          <strong>能被核对的东西才有长期价值</strong>。所以每条对外内容都必须说得出它的来源。
        </p>
      </section>

      <section aria-labelledby="about-how">
        <h2 id="about-how">我们如何工作</h2>
        <p>一条内容从进入系统到公开可见，要经过下面几道关卡，任何一道不过都不会出现在公开页面：</p>
        <ol role="list">
          <li>
            <strong>建稿</strong>：编辑录入正文（结构化富文本），并附上来源、版权与位置信息。
          </li>
          <li>
            <strong>送审</strong>：进入审核队列。编辑不能自己审核、也不能自己发布。
          </li>
          <li>
            <strong>复核</strong>：审核人核对来源、版权与必填项；不通过则退回并写明理由。
          </li>
          <li>
            <strong>发布</strong>：通过后公开，并保留完整的修订记录与审计日志。
          </li>
        </ol>
        <p>
          修订记录与审核动作<strong>只增不改</strong>：历史版本不会被覆盖，任何一次改动都能追溯到
          具体的操作人与时间。详细规范见 <Link href="/sources">来源、引用与纠错</Link>。
        </p>
      </section>

      <section aria-labelledby="about-coordinates">
        <h2 id="about-coordinates">地图与坐标系</h2>
        <p>
          底图由高德地图提供。站点<strong>存储</strong>的原始坐标是 WGS-84（GPS 原始坐标），
          只在交给底图渲染的那一刻转换为 GCJ-02（高德使用的法定坐标系），
          以免两套偏移量污染权威数据。这两者在国内相差 100~500 米，南京一带约 300 米。
        </p>
        <p>
          坐标精度分为「精确 / 近似 / 仅区域级 / 未知」，并单独标注核验状态。
          <strong>精度不足时地图不显示精确点位</strong>，只在列表里说明情况 ——
          与其给一个看起来精确但其实没核对过的点，不如说清楚它不确定。
        </p>
        <p>
          <Link href="/map">打开地点地图</Link>
        </p>
      </section>

      <section aria-labelledby="about-status">
        <h2 id="about-status">当前状态</h2>
        <p>
          本站仍在建设期，页面上的示例条目均为<strong>演示数据</strong>，未经人工史实核验，
          不应作为南京史实的引用来源。首批经过完整核验的内容正在整理中。
        </p>
        <p className="banner" role="note">
          若某条内容标注为「示例」或「待核验」，它就是尚未核验的演示条目 —— 请不要引用。
        </p>
      </section>

      <section id="feedback" aria-labelledby="about-feedback">
        <h2 id="about-feedback">纠错与建议</h2>
        <p>
          发现史实错误、引用有误、坐标偏差或版权问题的，请通过项目维护渠道反馈，并在描述中写明：
        </p>
        <ul role="list">
          <li>
            条目 URL 或 slug（例如 <code>/chronicle/example-slug</code>）；
          </li>
          <li>具体有争议的表述或字段；</li>
          <li>你依据的来源（书名、页码、档案号或可核验链接）。</li>
        </ul>
        <p className="banner" role="note">
          反馈邮箱与值班责任人尚未在项目中确认。在正式渠道确定前，本站不会在此处公开任何
          未经确认的联系地址 —— 宁可不给联系方式，也不给一个没人维护的地址。
        </p>
        <p>
          更正流程：核实来源 → 编辑修订并留存记录 → 审核人复核 → 重新发布。 同样的规范详见{' '}
          <Link href="/sources#corrections">内容纠错</Link>。
        </p>
      </section>

      <section aria-labelledby="about-more">
        <h2 id="about-more">继续浏览</h2>
        <p>
          <Link href="/chronicle">文化志</Link> · <Link href="/living">生活录</Link> ·{' '}
          <Link href="/search">全站检索</Link> · <Link href="/sources">来源与版权</Link>
        </p>
      </section>
    </div>
  );
}
