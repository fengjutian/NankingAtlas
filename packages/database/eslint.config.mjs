import baseConfig from '@nanking-atlas/eslint-config/node';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'coverage/**', 'prisma/migrations/**'],
  },
];