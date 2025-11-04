import { User, Role } from '../types';

const TOKEN_KEY = 'auth_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

const AUTH_BASE = (import.meta as any)?.env?.VITE_AUTH_BASE_URL || '/api/auth';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${AUTH_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  let res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  // Fallback: if proxy misroutes (404) and we're using default base, retry direct auth server
  if (res.status === 404 && AUTH_BASE === '/api/auth') {
    try {
      const direct = `http://localhost:8765/api/auth${path.startsWith('/') ? '' : '/'}${path}`;
      res = await fetch(direct, { ...init, headers });
      const d2 = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d2?.error || `Request failed: ${res.status}`);
      return d2 as T;
    } catch (_) {}
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Email or password is incorrect.');
    }
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export async function register(params: { name: string; email: string; password: string; role: Role }): Promise<{ user: User; token: string }> {
  const data = await request<{ user: User; token: string }>('/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setToken(data.token);
  return data;
}

export async function login(params: { email: string; password: string }): Promise<{ user: User; token: string }> {
  const data = await request<{ user: User; token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setToken(data.token);
  return data;
}

export async function me(): Promise<{ user: User }> {
  return request<{ user: User }>('/me', { method: 'GET' });
}
