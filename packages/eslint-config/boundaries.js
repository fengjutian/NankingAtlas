// @ts-check
/**
 * 跨包依赖边界规则。
 *
 * 规则来源：docs/TECHNICAL_IMPLEMENTATION.md §3
 *   "依赖方向固定为 apps → packages。packages 之间禁止环依赖；
 *    web 和 admin 禁止导入 API 内部代码或 Prisma client。"
 *
 * 此文件只产出"应用项目"与"包"之间方向的限制；
 * 具体的 packages 互不互导由各包自己的 eslint.config.mjs 写明。
 */

/**
 * @typedef {Object} BoundaryOptions
 * @property {'web' | 'admin' | 'api' | 'package-api-contract' | 'package-database' | 'package-ui' | 'package-validation'} project
 *   当前项目角色，决定哪些 import 是被禁止的。
 */

/** @type {Record<BoundaryOptions['project'], import('eslint').Linter.RulesRecord>} */
const RESTRICTED_BY_PROJECT = {
  web: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@nanking-atlas/api/*', '@nanking-atlas/api'],
            message:
              '公开站禁止 import @nanking-atlas/api 内部模块；只能通过 @nanking-atlas/api-contract 或 @nanking-atlas/validation 交换类型。',
          },
          {
            group: ['@nanking-atlas/database/*', '@nanking-atlas/database'],
            message:
              '公开站禁止 import @nanking-atlas/database；前端绝不直连数据库（AGENTS.md §2.2）。',
          },
        ],
      },
    ],
  },
  admin: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@nanking-atlas/api/*', '@nanking-atlas/api'],
            message:
              '管理后台禁止 import @nanking-atlas/api 内部模块；只能通过 @nanking-atlas/api-contract 或 @nanking-atlas/validation 交换类型。',
          },
          {
            group: ['@nanking-atlas/database/*', '@nanking-atlas/database'],
            message:
              '管理后台禁止 import @nanking-atlas/database；前端绝不直连数据库（AGENTS.md §2.2）。',
          },
        ],
      },
    ],
  },
  api: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@nanking-atlas/api-contract/*', '@nanking-atlas/api-contract'],
            message:
              'API 本身不依赖 @nanking-atlas/api-contract；api-contract 是给 web/admin 用的。',
          },
        ],
      },
    ],
  },
  // packages 互相方向：见各包 eslint.config.mjs 自身的 patterns
  'package-api-contract': {},
  'package-database': {},
  'package-ui': {},
  'package-validation': {},
};

/**
 * @param {BoundaryOptions} options
 * @returns {import('eslint').Linter.Config}
 */
export function createBoundariesConfig(options) {
  return {
    rules: RESTRICTED_BY_PROJECT[options.project] ?? {},
  };
}
