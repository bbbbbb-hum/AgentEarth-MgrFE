export const apiBaseUrl = import.meta.env.BASE_URL;

/**
 * JWT Payload 类型
 */
export interface JwtPayload {
  exp?: number;
  iat?: number;
  userId?: string;
}

/**
 * 解析 JWT token（仅解码 payload，不验证签名）
 */
export function parseJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * 检查 token 是否已过期（提前 60 秒判定为过期）
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  // 提前 60 秒判定为过期，避免请求时刚好过期
  return Date.now() >= (payload.exp - 60) * 1000;
}

/**
 * 获取当前 token
 */
export function getToken(): string | null {
  return localStorage.getItem('token');
}

/**
 * 登出 - 清除本地存储并跳转登录页
 */
export function logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('username');
  window.location.assign(`${apiBaseUrl}login`);
}

/**
 * 基础 fetch 封装（不带 Authorization）
 */
export const baseFetch = async (path: string, init?: RequestInit) => {
  const url = path.startsWith('http') || path.startsWith(apiBaseUrl)
    ? path
    : `${apiBaseUrl}${path.replace(/^\//, '')}`;
  return fetch(url, {
    ...init,
    credentials: 'include',
  });
};

/**
 * 带授权的 fetch 封装
 * - 自动添加 Authorization header
 * - 自动设置 Content-Type: application/json
 * - 401 响应时自动登出并跳转登录页
 */
export const authorizedFetch = async (path: string, init?: RequestInit) => {
  const token = getToken();
  
  // 如果 token 已过期，直接登出
  if (isTokenExpired(token)) {
    logout();
    // 返回一个永不 resolve 的 Promise，因为页面即将跳转
    return new Promise<Response>(() => {});
  }
  
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const resp = await baseFetch(path, { ...init, headers });
  if (resp.status === 401) {
    logout();
    // 返回一个永不 resolve 的 Promise，因为页面即将跳转
    return new Promise<Response>(() => {});
  }
  return resp;
};
