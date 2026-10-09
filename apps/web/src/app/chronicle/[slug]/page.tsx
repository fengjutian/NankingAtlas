import type { Metadata } from 'next';

import { ArchivePage, buildArchiveMetadata } from '@/components/ArchivePage';
import { DETAIL_REVALIDATE_SECONDS } from '@/components/ArchivePage';
import { CHRONICLE_TYPES } from '@/lib/types';

/** ISR：发布后最长 5 分钟生效，也可由签名 revalidation 立即触发。 */
export const revalidate = DETAIL_REVALIDATE_SECONDS;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildArchiveMetadata(slug, CHRONICLE_TYPES);
}

export default async function ChronicleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return ArchivePage({
    slug,
    allowedTypes: CHRONICLE_TYPES,
    backHref: '/chronicle',
    backLabel: '返回文化志',
  });
}
