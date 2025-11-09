import { getToken } from './authService';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8765';

function auth() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function generateQuiz(courseId: string, moduleId: string): Promise<{ id: string; questions: Array<{ question: string; options: string[]; correctAnswer: string }> }> {
  const res = await fetch(`${API_BASE}/api/quizzes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify({ courseId, moduleId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to generate quiz');
  return { id: data.quiz.id, questions: data.quiz.questions };
}

export async function submitQuiz(params: { courseId: string; moduleId: string; quizId: string; questions: Array<{ question: string; options: string[]; correctAnswer: string }>; answers: Array<number|string>; }): Promise<{ score: number; total: number }> {
  const res = await fetch(`${API_BASE}/api/quizzes/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to submit quiz');
  return data.result as { score: number; total: number };
}

export async function getAttemptsSummary(): Promise<Record<string, number>> {
  const res = await fetch(`${API_BASE}/api/quizzes/attempts/summary`, { headers: { 'Content-Type': 'application/json', ...auth() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to load attempts');
  return data.attemptsByCourse || {};
}

export async function getLastAttempt(courseId: string, moduleId: string): Promise<{ score: number; total: number; createdAt: string } | null> {
  const url = `${API_BASE}/api/quizzes/attempts/last?courseId=${encodeURIComponent(courseId)}&moduleId=${encodeURIComponent(moduleId)}`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...auth() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to load last attempt');
  return data.last || null;
}
