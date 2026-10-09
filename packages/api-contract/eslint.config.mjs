import baseConfig from '@nanking-atlas/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'coverage/**', 'src/generated/**'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nanking-atlas/api/*', '@nanking-atlas/api'],
              message:
                'api-contract 是给 web/admin 用的共享类型，自身禁止依赖 @nanking-atlas/api 内部模块。',
            },
            {
              group: ['@nanking-atlas/database/*', '@nanking-atlas/database'],
              message: 'api-contract 不依赖数据库包；DTO 形状由 OpenAPI 定义，不引用 Prisma。',
            },
            {
              group: ['@nanking-atlas/ui/*', '@nanking-atlas/ui'],
              message: 'api-contract 是后端 → 前端的类型通道，不应耦合 UI tokens/组件。',
            },
            {
              group: ['apps/*'],
              message: 'packages/* 禁止 import apps/*（依赖方向固定为 apps → packages）。',
            },
          ],
        },
      ],
    },
  },
];
