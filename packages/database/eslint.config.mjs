import baseConfig from '@nanking-atlas/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'prisma/migrations/**',
      // prisma/ 下的 CLI 脚本（seed / backup / restore-drill）在 tsconfig 的
      // include 之外（rootDir 是 src），解析不了就报 "not found by the project service"。
      // 它们由 tsx 直接执行，类型安全由运行时保证；与 seed.ts 同理排除。
      'prisma/seed.ts',
      'prisma/backup.ts',
      'prisma/restore-drill.ts',
    ],
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
