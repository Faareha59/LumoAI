import { getToken } from './authService';

const MATERIALS_BASE = '/api/materials';
const RAG_BASE = '/api/rag';

export async function uploadMaterial(params: { courseId: string; moduleId?: string | null; file: File; title?: string }) {
  const token = getToken();
  const form = new FormData();
  form.append('courseId', params.courseId);
  if (params.moduleId) form.append('moduleId', params.moduleId);
  if (params.title) form.append('title', params.title);
  form.append('file', params.file);

  const res = await fetch(`${MATERIALS_BASE}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Upload failed');
  return data as { material: { id: string; indexed: boolean; chunks?: number; warning?: string } };
}

export async function listMaterials(courseId: string, moduleId?: string) {
  const token = getToken();
  const url = new URL(`${MATERIALS_BASE}/list`, window.location.origin);
  url.searchParams.set('courseId', courseId);
  if (moduleId) url.searchParams.set('moduleId', moduleId);
  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to list materials');
  return data as { materials: Array<{ id: string; title: string; size: number; mime: string; indexed: boolean; createdAt: string }>} ;
}

export async function retrieveContext(params: { courseId: string; moduleId?: string; topic: string; limit?: number }) {
  const token = getToken();
  const res = await fetch(`${RAG_BASE}/retrieve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to retrieve context');
  return data as { chunks: Array<{ text: string; materialId: string; chunkIndex: number; score: number }> };
}
