import { serializeJsonLd } from '@/lib/seo';

/**
 * JSON-LD 脚本节点。
 *
 * `serializeJsonLd` 已把 `<`/`>`/`&`/行分隔符转成 `\uXXXX`，
 * 因此标题里的 `</script>` 无法提前闭合标签。
 */
export function JsonLdScript({ data }: { readonly data: Record<string, unknown> | null }) {
  const json = serializeJsonLd(data);
  if (json === null) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
