import Link from 'next/link';

interface ColumnCard {
  title: string;
  description: string;
  href: string;
  count: number;
  countLabel: string;
}

const COLUMNS: readonly ColumnCard[] = [
  {
    title: '文化志',
    description: '以朝代、人物、事件为线索的长文与档案。',
    href: '/chronicle',
    count: 0,
    countLabel: '篇已发布',
  },
  {
    title: '生活录',
    description: '当代人对街巷、节令、饮食与日常的记录。',
    href: '/living',
    count: 0,
    countLabel: '篇已发布',
  },
  {
    title: '互动地图',
    description: '按类型与坐标浏览的地点与路线。',
    href: '/map',
    count: 0,
    countLabel: '个地点已发布',
  },
  {
    title: '关于本项目',
    description: '编辑原则、引用与版权、纠错与建议入口。',
    href: '/about',
    count: 0,
    countLabel: '次说明',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="home-hero" aria-labelledby="home-title">
        <p className="home-hero__eyebrow">Nanking Atlas · 金陵风物志</p>
        <h1 id="home-title" className="home-hero__title">
          南京城市文化数字档案
        </h1>
        <p className="home-hero__lede">
          以可核验的史料、版权与坐标为底，建设一座对所有人开放的南京城市文化档案、互动街巷地图与生活记录平台。
        </p>
        <div className="home-hero__cta">
          <Link href="/chronicle" className="home-hero__btn home-hero__btn--primary">
            浏览文化志
          </Link>
          <Link href="/map" className="home-hero__btn">
            打开地图
          </Link>
        </div>
      </section>

      <section className="banner" role="status" aria-label="项目当前阶段">
        <strong>示例 / 待核验</strong> · 本页是 P0
        工程骨架下的公开站静态原型。当前对外可访问的真实内容数为 <strong>0</strong>；首批内容将在 P1
        阶段编辑建稿、来源补全、审核通过后按 publication readiness 校验正式上线。
        页面所示品牌、栏目与文案仅为设计参考，不构成已发布事实。
      </section>

      <section aria-labelledby="columns-title" className="home-section">
        <h2 id="columns-title" className="home-section__title">
          四大栏目
        </h2>
        <p className="muted home-section__lede">
          所有栏目入口在 P2 之前为占位；点击将进入 404 页直至对应内容上线。
        </p>
        <ul className="home-grid" role="list">
          {COLUMNS.map((col) => (
            <li key={col.href}>
              <Link href={col.href} className="home-card">
                <h3 className="home-card__title">{col.title}</h3>
                <p className="home-card__desc">{col.description}</p>
                <p
                  className="home-card__count"
                  aria-label={`已发布数 ${col.count} ${col.countLabel}`}
                >
                  <span className="home-card__count-num">{col.count}</span>
                  <span className="home-card__count-label">{col.countLabel}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="empty-title" className="home-empty">
        <h2 id="empty-title" className="home-section__title">
          近期内容
        </h2>
        <p className="muted">暂无已发布条目。</p>
        <p className="muted">
          编辑流程：建稿 → 补充来源与版权 → 提交审核 → 审核通过 → 发布。地图与详细档案将在 P2
          阶段开放。
        </p>
      </section>

      <section aria-labelledby="status-title" className="home-section">
        <h2 id="status-title" className="home-section__title">
          当前阶段
        </h2>
        <dl className="home-status">
          <div>
            <dt>已发布条目</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>已建索引</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>已收录地点（含未核实）</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>已审稿件</dt>
            <dd>0</dd>
          </div>
        </dl>
        <p className="muted home-section__note">
          以上数字由 P2 公共 API 提供；当前 P0 阶段硬编码为 0。
        </p>
      </section>
    </>
  );
}
