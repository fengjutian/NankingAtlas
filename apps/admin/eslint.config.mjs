import baseConfig from '@nanking-atlas/eslint-config/react';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'coverage/**'],
  },
];
