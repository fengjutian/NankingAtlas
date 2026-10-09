import baseConfig from '@nanking-atlas/eslint-config/nextjs';
import { createBoundariesConfig } from '@nanking-atlas/eslint-config/boundaries';

export default [
  ...baseConfig,
  createBoundariesConfig({ project: 'web' }),
  {
    ignores: ['.next/**', 'next-env.d.ts', 'coverage/**'],
  },
];
