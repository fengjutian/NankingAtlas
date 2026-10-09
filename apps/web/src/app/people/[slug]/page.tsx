import type { Metadata } from 'next';

import { ArchivePage, buildArchiveMetadata, DETAIL_REVALIDATE_SECONDS } from '@/components/ArchivePage';

export const revalidate = DETAIL_REVALIDATE_SECONDS;

const ALLOWED = ['PERSON'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildArchiveMetadata(slug, ALLOWED);
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return ArchivePage({ slug, allowedTypes: ALLOWED, backHref: '/chronicle', backLabel: '返回文化志' });
}
