import baseConfig from '@nanking-atlas/eslint-config/react';
import { createBoundariesConfig } from '@nanking-atlas/eslint-config/boundaries';

export default [
  ...baseConfig,
  createBoundariesConfig({ project: 'admin' }),
  {
    ignores: ['dist/**', 'coverage/**'],
  },
];
