import React, { useState } from 'react';
import { CourseModule, VideoDraft } from '../../types';
import Button from '../common/Button';
import { PlusIcon, DeleteIcon, CheckIcon } from '../Icons';
import { getToken } from '../../services/authService';

interface ManualCourseCreatorProps {
    onCreateCourse: (subject: string, modules: CourseModule[]) => void;
    onCancel: () => void;
}

interface TempLecture {
    title: string;
    file: File | null;
}

interface TempModule {
    id: string;
    title: string;
    description: string;
    lectures: TempLecture[];
}

const ManualCourseCreator: React.FC<ManualCourseCreatorProps> = ({ onCreateCourse, onCancel }) => {
    const [subject, setSubject] = useState('');
    const [modules, setModules] = useState<TempModule[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const addModule = () => {
        const newMod: TempModule = {
            id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            title: '',
            description: '',
            lectures: [{ title: '', file: null }]
        };
        setModules([...modules, newMod]);
    };

    const updateModule = (modId: string, updates: Partial<TempModule>) => {
        setModules(modules.map(m => m.id === modId ? { ...m, ...updates } : m));
    };

    const addLecture = (modId: string) => {
        setModules(modules.map(m => {
            if (m.id === modId) {
                return { ...m, lectures: [...m.lectures, { title: '', file: null }] };
            }
            return m;
        }));
    };

    const updateLecture = (modId: string, lectureIdx: number, updates: Partial<TempLecture>) => {
        setModules(modules.map(m => {
            if (m.id === modId) {
                const nextLectures = [...m.lectures];
                nextLectures[lectureIdx] = { ...nextLectures[lectureIdx], ...updates };
                return { ...m, lectures: nextLectures };
            }
            return m;
        }));
    };

    const removeModule = (modId: string) => {
        setModules(modules.filter(m => m.id !== modId));
    };

    const handleCreate = async () => {
        if (!subject.trim()) return alert('Please enter a course subject.');
        if (modules.length === 0) return alert('Please add at least one module.');

        setIsSaving(true);
        try {
            const token = getToken();
            const finalModules: CourseModule[] = [];

            for (const m of modules) {
                const materialIds: Record<string, string> = {};
                const topics: string[] = [];

                for (const l of m.lectures) {
                    if (!l.title.trim()) continue;
                    topics.push(l.title);

                    if (l.file) {
                        const formData = new FormData();
                        formData.append('file', l.file);
                        formData.append('title', l.title);
                        // We need the course context during upload for linking
                        // Since course isn't created yet, we'll pre-generate an ID if needed
                        // or rely on the backend to handle the linkage during course creation.
                        // Actually, better to create course first, then upload.
                        // But for now let's just make sure titles match.

                        const uploadRes = await fetch('/api/materials/upload-raw', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                        });
                        if (uploadRes.ok) {
                            const uploadData = await uploadRes.json();
                            materialIds[l.title] = uploadData.id;
                        } else {
                            console.error('Failed to upload PDF for', l.title);
                            alert(`Failed to upload PDF for "${l.title}". The course will be created without it.`);
                        }
                    }
                }

                finalModules.push({
                    id: m.id,
                    title: m.title || 'Untitled Module',
                    description: m.description,
                    topics: topics,
                    lectures: [],
                    materialIds,
                    topicOutlines: topics.reduce((acc, t) => ({ ...acc, [t]: `Lecture material for ${t}` }), {})
                });
            }

            onCreateCourse(subject, finalModules);
        } catch (e) {
            console.error(e);
            alert('Failed to save course. Check console for details.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-2">Manual Course Creator</h2>
            <p className="text-muted-foreground text-sm mb-6">Create your curriculum from scratch and upload PDFs.</p>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium mb-2">Course Subject</label>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="e.g., Introduction to Chemistry"
                        className="w-full p-4 bg-background border border-border rounded-lg text-lg focus:ring-2 focus:ring-black outline-none"
                    />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-lg font-semibold">Modules</label>
                        <Button variant="secondary" size="sm" onClick={addModule}>
                            <PlusIcon className="w-4 h-4 mr-1" /> Add Module
                        </Button>
                    </div>

                    {modules.map((m, mIdx) => (
                        <div key={m.id} className="border border-border rounded-lg p-5 bg-secondary/5 relative group">
                            <button
                                onClick={() => removeModule(m.id)}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-black transition-colors"
                            >
                                <DeleteIcon className="w-5 h-5" />
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Module Title</label>
                                    <input
                                        type="text"
                                        value={m.title}
                                        onChange={(e) => updateModule(m.id, { title: e.target.value })}
                                        placeholder={`Module ${mIdx + 1}`}
                                        className="w-full p-2 bg-background border border-border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={m.description}
                                        onChange={(e) => updateModule(m.id, { description: e.target.value })}
                                        className="w-full p-2 bg-background border border-border rounded"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Lectures & PDFs</label>
                                {m.lectures.map((l, lIdx) => (
                                    <div key={lIdx} className="flex flex-col md:flex-row gap-3 items-end md:items-center bg-background p-3 rounded border border-border">
                                        <div className="flex-1 w-full">
                                            <input
                                                type="text"
                                                value={l.title}
                                                onChange={(e) => updateLecture(m.id, lIdx, { title: e.target.value })}
                                                placeholder="Lecture Title"
                                                className="w-full p-2 text-sm border-none focus:ring-0 bg-transparent"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="file"
                                                id={`file-${m.id}-${lIdx}`}
                                                className="hidden"
                                                accept=".pdf"
                                                onChange={(e) => updateLecture(m.id, lIdx, { file: e.target.files?.[0] || null })}
                                            />
                                            <label
                                                htmlFor={`file-${m.id}-${lIdx}`}
                                                className={`cursor-pointer px-3 py-1.5 rounded text-xs transition-colors ${l.file ? 'bg-black text-white border border-black shadow-sm' : 'bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80'}`}
                                            >
                                                {l.file ? '✓ PDF Attached' : 'Upload PDF'}
                                            </label>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => addLecture(m.id)}
                                    className="text-xs font-medium text-black hover:text-gray-700 flex items-center gap-1"
                                >
                                    <PlusIcon className="w-3 h-3" /> Add Another Lecture
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-4 pt-6 border-t border-border">
                    <Button onClick={handleCreate} disabled={isSaving || !subject}>
                        {isSaving ? 'Saving Course...' : 'Create Course'}
                    </Button>
                    <Button variant="secondary" onClick={onCancel} disabled={isSaving}>Cancel</Button>
                </div>
            </div>
        </div>
    );
};

export default ManualCourseCreator;
