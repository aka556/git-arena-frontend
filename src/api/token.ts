/**
 * 登录 token 的本地存取（唯一来源）。http.ts 请求拦截器与 auth store 都经此读写，
 * 避免魔法字符串散落、也避免 http.ts 反向依赖 store 造成循环引用。
 */
const TOKEN_KEY = 'git-arena.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}
