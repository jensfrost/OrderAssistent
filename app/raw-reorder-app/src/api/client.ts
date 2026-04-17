import { APP_ENV, API_ROOT, buildApiUrl } from '../config/api';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export { APP_ENV, API_ROOT };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const url = buildApiUrl(path);
  console.log('[API]', init?.method || 'GET', url, 'ENV=', APP_ENV);

  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Expected JSON but got: ${text}`);
  }

  return response.json();
}

export function apiGet<T>(path: string) {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: body == null ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'PUT',
    body: body == null ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

export async function getJson<T>(path: string): Promise<T> {
  const url = buildApiUrl(path);
  console.log('[getJson] path =', path);
  console.log('[getJson] url =', url);
  const response = await fetch(buildApiUrl(path), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  return response.json();
}