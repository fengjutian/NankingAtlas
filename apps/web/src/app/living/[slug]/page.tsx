import type { Metadata } from 'next';

import { ArchivePage, buildArchiveMetadata, DETAIL_REVALIDATE_SECONDS } from '@/components/ArchivePage';
import { LIVING_TYPES } from '@/lib/types';

export const revalidate = DETAIL_REVALIDATE_SECONDS;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildArchiveMetadata(slug, LIVING_TYPES);
}

export default async function LivingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return ArchivePage({
    slug,
    allowedTypes: LIVING_TYPES,
    backHref: '/living',
    backLabel: '返回生活录',
  });
}
