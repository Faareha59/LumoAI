import { getToken } from './authService';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8765';

function auth() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
}

export interface Exercise {
    _id?: string;
    title: string;
    description: string;
    requirements: string[];
    learningObjectives: string[];
    portfolioTip: string;
    solution?: string;
    feedback?: string;
    courseId?: string;
    moduleId?: string;
    topic?: string;
    status?: 'saved' | 'completed' | 'graded';
}

export async function generateExercise(params: { courseId: string; moduleId: string; topic: string; materialId?: string }): Promise<Exercise> {
    const res = await fetch(`${API_BASE}/api/exercises/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to generate exercise');
    return data.exercise;
}

export async function saveExercise(params: { courseId: string; moduleId: string; topic: string; exercise: Exercise }): Promise<void> {
    const res = await fetch(`${API_BASE}/api/exercises/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to save exercise');
    }
}

export async function listSavedExercises(): Promise<Exercise[]> {
    const res = await fetch(`${API_BASE}/api/exercises`, {
        headers: { 'Content-Type': 'application/json', ...auth() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to list exercises');
    return data.exercises || [];
}

export async function deleteExercise(exerciseId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/exercises/${exerciseId}`, {
        method: 'DELETE',
        headers: { ...auth() },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete exercise');
    }
}

export async function evaluateExercise(exerciseId: string, solution: string): Promise<{ feedback: string; status: string }> {
    const res = await fetch(`${API_BASE}/api/exercises/${exerciseId}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ solution }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to evaluate solution');
    return data;
}
