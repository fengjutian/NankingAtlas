/**
 * 后台通用的日期时间格式化。
 *
 * 独立成模块而不是留在 `ContentListPage` 里：审核区的版本时间线也要用它，
 * 从页面组件导入会把 `ContentListPage → api/client → lib/env` 整条链路
 * 拖进只想要一个格式化函数的模块里（渲染测试与懒加载都会因此被迫加载
 * env 校验与 HTTP 客户端）。
 *
 * 格式非法时**原样返回**，不抛异常也不显示 "Invalid Date" —— 追溯记录里的
 * 时间即便异常也比空白更有信息量。
 */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number): string => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
