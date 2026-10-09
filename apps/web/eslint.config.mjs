import baseConfig from '@nanking-atlas/eslint-config/nextjs';

export default [
  ...baseConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts', 'coverage/**'],
  },
];
