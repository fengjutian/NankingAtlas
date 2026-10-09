import type { Metadata } from 'next';

import { ArchivePage, buildArchiveMetadata } from '@/components/ArchivePage';
import { LIVING_TYPES } from '@/lib/types';

/**
 * force-dynamic + await 的理由见 chronicle/[slug]/page.tsx 的注释。
 * 简述：JSX 形式的 async component 会被 React 独立调度，notFound() 只能换内容
 * 不能改状态码（已撤回的内容会返回 200，违反技术方案 §9.3）。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildArchiveMetadata(slug, LIVING_TYPES);
}

export default async function LivingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return await ArchivePage({
    slug,
    allowedTypes: LIVING_TYPES,
    backHref: '/living',
    backLabel: '返回生活录',
  });
}
