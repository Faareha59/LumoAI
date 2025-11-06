const { VITE_AUTH_BASE_URL, VITE_ADMIN_BASE_URL } = import.meta.env as Record<string, string | undefined>;

const AUTH_BASE = VITE_AUTH_BASE_URL?.trim() || 'http://localhost:8877/api/auth';
const ADMIN_BASE = VITE_ADMIN_BASE_URL?.trim() || AUTH_BASE.replace(/\/auth$/, '/admin');

interface CreateTeacherResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface ResetPasswordResponse {
  success: boolean;
}

async function adminRequest<T>(path: string, secret: string, body: Record<string, unknown>): Promise<T> {
  if (!secret) {
    throw new Error('Admin secret is required');
  }
  const url = `${ADMIN_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export async function createTeacher(params: { name: string; email: string; password: string }, secret: string) {
  return adminRequest<CreateTeacherResponse>('/create-teacher', secret, params);
}

export async function resetPassword(params: { email: string; newPassword: string }, secret: string) {
  return adminRequest<ResetPasswordResponse>('/reset-password', secret, params);
}
