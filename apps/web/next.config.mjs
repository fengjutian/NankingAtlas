/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // `@nanking-atlas/validation` 以 TS 源码形式发布（main 指向 src/index.ts），
  // 其内部使用 NodeNext 风格的 `./x.js` 说明符。webpack 默认不把 `.js` 映射回
  // `.ts`，因此必须显式声明 extensionAlias，否则生产构建解析失败。
  transpilePackages: ['@nanking-atlas/validation', '@nanking-atlas/ui'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
