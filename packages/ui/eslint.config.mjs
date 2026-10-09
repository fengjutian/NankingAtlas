import baseConfig from '@nanking-atlas/eslint-config/react';

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
              message: 'ui 包是纯视觉层，不应耦合 API 或契约层。',
            },
            {
              group: ['@nanking-atlas/database/*', '@nanking-atlas/database'],
              message: 'ui 包不依赖数据库。',
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
