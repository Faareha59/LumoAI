import { getToken } from './authService';

const BASE = '/api/enrollments';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listMyEnrollments(): Promise<{ courseIds: string[] }> {
  const res = await fetch(BASE, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch enrollments');
  return data as { courseIds: string[] };
}

export async function enroll(courseId: string): Promise<void> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ courseId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to enroll');
}

export async function withdraw(courseId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to withdraw');
}
