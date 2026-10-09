import baseConfig from '@nanking-atlas/eslint-config/node';
import { createBoundariesConfig } from '@nanking-atlas/eslint-config/boundaries';

export default [
  ...baseConfig,
  createBoundariesConfig({ project: 'api' }),
  {
    ignores: ['dist/**', 'coverage/**'],
  },
];
