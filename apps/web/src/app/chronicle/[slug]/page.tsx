import type { Metadata } from 'next';

import { ArchivePage, buildArchiveMetadata } from '@/components/ArchivePage';
import { CHRONICLE_TYPES } from '@/lib/types';

/**
 * 动态渲染（禁用 ISR 预渲染）。
 *
 * 两个原因，缺一不可：
 *
 * 1. Next 15 的流式渲染会在第一个 `await` 后 flush shell，此后
 *    `notFound()` 只能替换内容、无法再改 HTTP 状态码 —— 结果是「内容已撤回」
 *    也返回 200（软 404），违反技术方案 §9.3「撤回后正确返回 404」。
 *    `force-dynamic` 让路由完全按请求渲染。
 *
 * 2. `ArchivePage` 必须 `await` 而**不能**写成 `<ArchivePage />`。
 *    async Server Component 作为 JSX 元素会被 React 独立调度，父页面
 *    在它完成前就已返回并提交 200 —— 此时 `notFound()` 抛出的异常
 *    只能替换 body，同样改不了状态码。`await` 让 `notFound()` 在页面
 *    自身的渲染栈里抛出，Next 才能返回真正的 404。
 *
 * 代价：详情页不再有 ISR 页面缓存。数据层的 300 秒 revalidate 仍保留在
 * fetch 上（见 `ArchivePage`），由签名 revalidation 主动失效。
 */
export const dynamic = 'force-dynamic';

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
  return await ArchivePage({
    slug,
    allowedTypes: CHRONICLE_TYPES,
    backHref: '/chronicle',
    backLabel: '返回文化志',
  });
}
