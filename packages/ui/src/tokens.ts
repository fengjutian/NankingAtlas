/**
 * 跨 web/admin 共享的 design tokens。
 *
 * 这是**事实来源**：CSS 变量值（packages/ui/src/tokens.css）必须与此保持一致。
 * P0-04 阶段仅含颜色/字体/间距三类；P0-06 起会按设计系统扩展。
 *
 * 颜色与文档中"金陵风物志"品牌色对应，但**不绑定**到具体南京史实。
 * 任何具体历史色（如城墙灰、琉璃黄）需在 P2 由人工依据史料确认后再加入。
 */

export const COLORS = Object.freeze({
  // 公开站
  webBackground: '#f8f5ef',
  webForeground: '#1f1d18',
  webMuted: '#6b665d',
  webAccent: '#8b1e1e',
  webBorder: '#d9d4c7',
  webWarning: '#5a4a14',
  webWarningBackground: '#fdf3d0',
  webWarningBorder: '#e6cf7d',

  // 管理后台
  adminBackground: '#1f1d18',
  adminForeground: '#f5f1e8',
  adminMuted: '#b3ad9f',
  adminAccent: '#c8912a',
  adminBorder: '#3b362d',
  adminWarning: '#fbe5b6',
  adminWarningBackground: '#3a2e16',
  adminWarningBorder: '#6f541d',
} as const);

export const FONT_STACKS = Object.freeze({
  serif: "'Songti SC', 'STSong', 'Source Han Serif', serif",
  sans: "'PingFang SC', 'Hiragino Sans GB', system-ui, sans-serif",
} as const);

export const SPACING = Object.freeze({
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  xxl: '3rem',
} as const);

export const MAX_CONTENT_WIDTH = Object.freeze({
  web: '72rem',
  admin: '80rem',
} as const);

export type ColorToken = keyof typeof COLORS;
export type SpacingToken = keyof typeof SPACING;
