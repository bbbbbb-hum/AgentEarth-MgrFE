export const apiBaseUrl = import.meta.env.BASE_URL;

export const baseFetch = async (path: string, init?: RequestInit) => {
  const url = path.startsWith('http') || path.startsWith(apiBaseUrl)
    ? path
    : `${apiBaseUrl}${path.replace(/^\//, '')}`;
  return fetch(url, {
    ...init,
    credentials: 'include',
  });
};

export const authorizedFetch = async (path: string, init?: RequestInit) => {
  const token = localStorage.getItem('token');
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const resp = await baseFetch(path, { ...init, headers });
  if (resp.status === 401) {
    localStorage.removeItem('token');
    window.location.assign(`${apiBaseUrl}login`);
  }
  return resp;
};
