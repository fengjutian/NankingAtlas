import baseConfig from '@nanking-atlas/eslint-config/node';
import { createBoundariesConfig } from '@nanking-atlas/eslint-config/boundaries';

export default [
  ...baseConfig,
  createBoundariesConfig({ project: 'api' }),
  {
    // scripts/ 由 tsx 直接执行，不参与应用构建；但仍需类型感知 lint，
    // 所以必须留在 tsconfig.test.json 的 include 里（否则报 project service 错误）。
    ignores: ['dist/**', 'coverage/**', 'prisma-test/**'],
  },
];
