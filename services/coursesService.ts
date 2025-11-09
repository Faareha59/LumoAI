import { getToken } from './authService';
import type { Course, CourseModule, VideoDraft } from '../types';

const BASE = '/api/courses';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchCourses(): Promise<{ courses: Course[] }> {
  const res = await fetch(`${BASE}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to fetch courses');
  return data as { courses: Course[] };
}

export async function createCourse(subject: string, modules: CourseModule[]): Promise<Course> {
  const res = await fetch(`${BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title: subject, modules }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to create course');
  return (data as any).course as Course;
}

export async function addLecture(courseId: string, moduleId: string, lecture: VideoDraft): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/lectures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(lecture),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to add lecture');
}

export async function deleteLecture(courseId: string, moduleId: string, lectureId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/lectures/${encodeURIComponent(lectureId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to delete lecture');
}

export async function updateModuleTopics(courseId: string, moduleId: string, topics: string[]): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/topics`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ topics }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to update topics');
}

export async function updateCourse(courseId: string, payload: { title?: string; description?: string }): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to update course');
}

export async function deleteCourse(courseId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to delete course');
}
