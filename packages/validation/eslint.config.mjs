import baseConfig from '@nanking-atlas/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nanking-atlas/api/*', '@nanking-atlas/api', '@nanking-atlas/api-contract'],
              message: 'validation 是依赖链最底层的纯校验包；API 业务 schema 在 API 内部定义。',
            },
            {
              group: ['@nanking-atlas/database/*', '@nanking-atlas/database'],
              message: 'validation 不依赖数据库。',
            },
            {
              group: ['@nanking-atlas/ui/*', '@nanking-atlas/ui'],
              message: 'validation 不依赖 UI tokens/组件。',
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
