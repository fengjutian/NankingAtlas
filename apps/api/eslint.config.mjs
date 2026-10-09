import baseConfig from '@nanking-atlas/eslint-config/node';
import { createBoundariesConfig } from '@nanking-atlas/eslint-config/boundaries';

export default [
  ...baseConfig,
  createBoundariesConfig({ project: 'api' }),
  {
    // scripts/ 是命令行工具（OpenAPI 生成器、breaking 检查器）。
    // 它们的存在意义就是把结果 console 出来，所以这里放宽 no-console；
    // 业务代码仍然禁止裸 console —— 日志必须走 nestjs-pino。
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // dist / coverage / 集成测试临时库都不参与 lint。
    // `scripts/*.js` 是 tsx 执行时产出的编译残留（源码是 .ts），同样排除。
    ignores: [
      'dist/**',
      'coverage/**',
      'prisma-test/**',
      // tsx / ts-node 执行 .ts 时可能落下的编译残留（源码是同名 .ts）
      'scripts/**/*.js',
      'scripts/**/*.js.map',
      'test/**/*.js',
      'test/**/*.js.map',
      // 手工验收脚本是纯 .mjs（不参与 tsc），类型感知 lint 无法解析
      'scripts/**/*.mjs',
    ],
  },
];
