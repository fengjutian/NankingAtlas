import Link from 'next/link';

import type { Metadata } from 'next';

import { buildPageMetadata, truncateDescription } from '@/lib/seo';
import { SOURCE_KIND_LABELS, RIGHTS_LABELS, type RightsStatus, type SourceKind } from '@/lib/types';

const BASE_PATH = '/sources';
const DESCRIPTION =
  '本站的来源类型、引用规范、版权处理原则与内容纠错方式。所有对外内容均需通过来源、版权与坐标核验。';

export const metadata: Metadata = buildPageMetadata({
  title: '来源、引用与纠错',
  description: DESCRIPTION,
  path: BASE_PATH,
});

const KIND_NOTES: Readonly<Record<SourceKind, string>> = {
  BOOK: '正式出版的著作、方志、别集等。',
  JOURNAL: '期刊论文、学报与研究报告。',
  ARCHIVE: '档案馆、图书馆与地方志部门提供的原始材料。',
  WEBSITE: '有明确责任方的公开网站内容，需记录访问时间。',
  INTERVIEW: '口述访谈，需记录访谈时间与授权范围。',
  FIELD_NOTE: '田野调查记录，需记录调查时间与地点精度。',
  OTHER: '以上未覆盖的材料，需在条目中说明其性质。',
};

const RIGHTS_NOTES: Readonly<Record<RightsStatus, string>> = {
  UNKNOWN: '版权状态未知：不进入公开页面。',
  LICENSED: '已获得授权，按授权范围展示并署名。',
  PUBLIC_DOMAIN: '公有领域素材，展示时仍需标注来源。',
  FAIR_USE_REVIEWED: '已完成合理使用人工审核，限于说明性引用。',
  OWNED: '自有版权素材。',
  RESTRICTED: '受限素材：不进入公开页面。',
};

export default function SourcesPage() {
  return (
    <div className="shell prose-page">
      <header className="page-header">
        <h1 className="page-header__title">来源、引用与纠错</h1>
        <p className="page-header__lede">{truncateDescription(DESCRIPTION, 100)}</p>
      </header>

      <section aria-labelledby="sources-principle">
        <h2 id="sources-principle">收录原则</h2>
        <p>
          本站坚持「没有来源不发布」：对外可见的条目必须具备标题、摘要、正文，
          以及至少一项可核验的来源，或明确的原创/采访说明。史料记载、学界观点、民间传说
          与编辑推断在条目中分别标注，传说不会被写成已证实事实。
        </p>
        <p className="muted">
          本页是说明性页面，不展示具体条目来源清单。条目级来源随公开接口开放后在详情页呈现；
          在此之前，详情页会明确标注「来源清单尚未开放」，而不是留白。
        </p>
      </section>

      <section aria-labelledby="sources-kinds">
        <h2 id="sources-kinds">来源类型</h2>
        <dl className="type-facts__list">
          {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[]).map((kind) => (
            <div key={kind} className="type-facts__row">
              <dt className="type-facts__label">{SOURCE_KIND_LABELS[kind]}</dt>
              <dd className="type-facts__value">{KIND_NOTES[kind]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="sources-rights">
        <h2 id="sources-rights">图片与版权</h2>
        <dl className="type-facts__list">
          {(Object.keys(RIGHTS_LABELS) as RightsStatus[]).map((status) => (
            <div key={status} className="type-facts__row">
              <dt className="type-facts__label">{RIGHTS_LABELS[status]}</dt>
              <dd className="type-facts__value">{RIGHTS_NOTES[status]}</dd>
            </div>
          ))}
        </dl>
        <p>
          公开页面上的每张图片都必须具备替代文本（alt）与署名（credit line）。
          未完成版权核验的素材不会被展示，需求文档中的外链示意图不作为可上线资产。
        </p>
      </section>

      <section aria-labelledby="sources-coordinates">
        <h2 id="sources-coordinates">坐标与核验</h2>
        <p>
          地点坐标标注精度（精确、近似、仅区域级、未知）与核验状态（未核验、部分核验、已核验、存在争议）。
          当精度不足以支持精确点位时，本站不展示精确经纬度，只说明精度与核验状态。
        </p>
      </section>

      <section id="corrections" aria-labelledby="corrections-title">
        <h2 id="corrections-title">内容纠错</h2>
        <p>
          如果你发现某条目的史实、引用、坐标或版权信息有误，请通过项目维护渠道反馈，并在描述中写明：
        </p>
        <ul role="list">
          <li>
            条目 URL 或 slug（例如 <code>/chronicle/example-slug</code>）；
          </li>
          <li>具体有争议的表述或字段；</li>
          <li>你依据的来源（书名、页码、档案号或可核验链接）。</li>
        </ul>
        <p className="banner" role="note">
          反馈邮箱与值班责任人尚未在项目中确认（属 P2 上线前的待决事项）。
          在正式渠道确定前，本站不会在此处公开任何未经确认的联系地址。
        </p>
        <p>
          更正流程：核实来源 → 由编辑在后台修订并留存修订记录 → 由审核人复核 →
          重新发布。历史修订只增不改，可追溯。
        </p>
      </section>

      <section aria-labelledby="sources-more">
        <h2 id="sources-more">继续浏览</h2>
        <p>
          <Link href={'/chronicle'}>文化志</Link> · <Link href={'/living'}>生活录</Link> ·{' '}
          <Link href={'/search'}>全站检索</Link>
        </p>
      </section>
    </div>
  );
}
