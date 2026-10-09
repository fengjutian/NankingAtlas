/**
 * refresh token Cookie 名称。
 *
 * 单一常量，避免"写 cookie 用一个名字、读 cookie 用另一个名字"这类
 * 静默失效的 bug。路径限定 `/api/v1/auth` —— 该 cookie 不需要发给其它路由。
 */
export const REFRESH_COOKIE = 'nla_rt' as const;