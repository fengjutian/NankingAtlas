# @nanking-atlas/ui

无业务状态的共享视觉层：design tokens（TS + CSS 变量）和可复用 UI 原件。**禁止**在此包内编写依赖具体业务（contents/users/places 等）的逻辑。

## 范围

- ✅ P0-04 已落地：颜色 / 字体 / 间距 / 内容宽度 tokens
- ⏳ P0-06 起：根据 design system 扩展 tokens 并加入通用 UI 组件（Button / TextField / Banner / Dialog 等）
- ⏳ 全部组件必须覆盖 loading / empty / error / forbidden / success 状态（AGENTS.md §6.4）

## 使用方式

```ts
import { COLORS, SPACING } from '@nanking-atlas/ui';
```

```css
@import '@nanking-atlas/ui/styles.css';
```

## 边界规则

| 允许                                                                           | 禁止                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| web / admin import 本包                                                        | 本包 import `@nanking-atlas/api`、`@nanking-atlas/database`、`apps/*`                  |
| 本包 import 其他 `@nanking-atlas/*` packages（仅 `@nanking-atlas/validation`） | 本包 import `@nanking-atlas/api-contract`（避免 web/admin → ui → api-contract 间接链） |
