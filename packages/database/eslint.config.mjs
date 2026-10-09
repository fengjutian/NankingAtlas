import baseConfig from '@nanking-atlas/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'coverage/**', 'prisma/migrations/**', 'prisma/seed.ts'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nanking-atlas/api/*', '@nanking-atlas/api'],
              message: 'database 包只提供 schema / 客户端，不依赖 API 内部模块。',
            },
            {
              group: ['@nanking-atlas/api-contract/*', '@nanking-atlas/api-contract'],
              message: 'database 包不依赖 api-contract；OpenAPI 类型应在 API 层生成并导出。',
            },
            {
              group: ['@nanking-atlas/ui/*', '@nanking-atlas/ui'],
              message: 'database 包不依赖 UI tokens/组件。',
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
