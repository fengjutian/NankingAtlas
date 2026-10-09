import Link from 'next/link';

import { ContentCard } from '@/components/ContentCard';
import { EmptyState } from '@/components/EmptyState';
import { getHomepage, listPublishedContents } from '@/lib/api';
import { buildPageMetadata } from '@/lib/seo';
import type { PublicContent } from '@/lib/types';

import type { Metadata } from 'next';
import type { Route } from 'next';

const REVALIDATE_SECONDS = 300;

export const metadata: Metadata = buildPageMetadata({
  title: '南京城市文化数字档案',
  description:
    'Nanking Atlas · 南京城市文化数字档案、互动街巷地图与城市生活记录平台。内容以来源、版权与坐标核验为前提发布。',
  path: '/',
});

interface ColumnCard {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly countLabel: string;
}

const COLUMNS: readonly ColumnCard[] = [
  { title: '文化志', description: '以人物、事件、建筑、民俗为线索的长文与档案。', href: '/chronicle', countLabel: '条已发布' },
  { title: '生活录', description: '当代人对街巷、节令、饮食与日常的记录。', href: '/living', countLabel: '条已发布' },
  { title: '全站检索', description: '按关键词与内容类型检索已发布档案。', href: '/search', countLabel: '条可检索' },
  { title: '来源说明', description: '来源类型、引用规范、版权与纠错入口。', href: '/sources', countLabel: '' },
];

export default async function HomePage() {
  // 首页优先读后台槽位；`/api/v1/homepage` 尚未上线时降级为"最新发布"列表，
  // 两种降级路径都只展示真实已发布数据，绝不填充示例内容。
  const [homepage, latestResult] = await Promise.all([
    getHomepage({ revalidate: REVALIDATE_SECONDS, tags: ['homepage'] }),
    listPublishedContents({ limit: 12 }, { revalidate: REVALIDATE_SECONDS, tags: ['contents'] }),
  ]);

  const latest: PublicContent[] = homepage.ok
    ? [...homepage.data.featured, ...homepage.data.latest].slice(0, 6)
    : (latestResult.ok ? latestResult.data.slice(0, 6) : []);
  const availableCount = latestResult.ok ? latestResult.data.length : 0;
  const interfaceReady = homepage.ok && latestResult.ok;

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
          <Link href={'/chronicle' as Route} className="home-hero__btn home-hero__btn--primary">
            浏览文化志
          </Link>
          <Link href={'/living' as Route} className="home-hero__btn">
            阅读生活录
          </Link>
        </div>
      </section>

      {!interfaceReady ? (
        <section className="shell" aria-label="内容接口状态">
          <p className="banner" role="status">
            <strong>内容接口未就绪</strong> · 本页展示的是接口实际返回的已发布条目。
            当没有可展示内容时，页面保持为空并说明原因，不以示例数据填充。
          </p>
        </section>
      ) : null}

      <section aria-labelledby="columns-title" className="home-section">
        <h2 id="columns-title" className="home-section__title">
          四大栏目
        </h2>
        <ul className="home-grid" role="list">
          {COLUMNS.map((col) => (
            <li key={col.href}>
              <Link href={col.href as Route} className="home-card">
                <h3 className="home-card__title">{col.title}</h3>
                <p className="home-card__desc">{col.description}</p>
                {col.countLabel === '' ? null : (
                  <p className="home-card__count">
                    <span className="home-card__count-num">
                      {col.href === '/search' ? availableCount : '—'}
                    </span>
                    <span className="home-card__count-label">{col.countLabel}</span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <p className="muted home-section__note">
          栏目计数需要按类型的统计接口；当前公开列表接口不支持分组计数，因此除检索外的计数以「—」显示，
          不使用硬编码数字冒充统计结果。
        </p>
      </section>

      <section aria-labelledby="latest-title" className="home-empty">
        <h2 id="latest-title" className="home-section__title">
          最新发布
        </h2>
        {latest.length > 0 ? (
          <ul className="content-list" role="list">
            {latest.map((item) => (
              <li key={item.id}>
                <ContentCard content={item} headingLevel={2} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="当前没有已发布内容"
            description="本站坚持来源、版权与坐标核验通过才发布。首批条目完成核验并通过审核后，会自动出现在这里。"
            actions={[
              { href: '/chronicle', label: '查看文化志栏目' },
              { href: '/sources', label: '了解收录与纠错流程' },
            ]}
            headingId="home-empty-title"
          />
        )}
      </section>
    </>
  );
}
