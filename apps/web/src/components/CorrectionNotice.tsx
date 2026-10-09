import Link from 'next/link';

import type { Route } from 'next';

/**
 * 纠错入口（P2-04）。
 *
 * 目标地址 `/sources#corrections` 是本站已存在的说明页；
 * 正式反馈渠道与责任人仍属 PRD §19「P2 前」未决事项，此处不编造邮箱或表单。
 */
export function CorrectionNotice({ slug }: { readonly slug: string }) {
  return (
    <aside className="correction" aria-labelledby="correction-title">
      <h2 id="correction-title" className="correction__title">
        内容纠错
      </h2>
      <p className="correction__text">
        发现史实、来源、坐标或版权信息有误？请在
        <Link href={'/sources#corrections' as Route}>来源与纠错说明</Link>
        中查看纠错流程，并注明条目
        <code className="correction__code">{slug}</code>
        与具体问题。
      </p>
    </aside>
  );
}
