export interface ArticleBodyProps {
  /** 必须来自 `renderTiptapToSafeHtml`（已转义 + 白名单净化）。 */
  readonly html: string;
  readonly valid: boolean;
}

/**
 * 正文容器。
 *
 * 安全边界：这里不做任何字符串拼接或转义，`html` 由 `renderArticle()`
 * （内部调用 `parseTiptapDocument` + `renderTiptapToSafeHtml`）产出。
 * 解析失败时显示降级提示而不是渲染空壳。
 */
export function ArticleBody({ html, valid }: ArticleBodyProps) {
  if (!valid || html === '') {
    return (
      <p className="banner" role="note">
        正文暂不可用：该条目未通过公开正文校验（内容不在允许的节点白名单内或已损坏）。
      </p>
    );
  }
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
