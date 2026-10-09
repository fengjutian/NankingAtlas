// @ts-check
import base from './base.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        React: 'readonly',
        JSX: 'readonly',
      },
    },
  },
];
