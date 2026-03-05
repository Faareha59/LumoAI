import React, { useState, useEffect } from 'react';
import { CourseModule } from '../../types';
import Button from '../common/Button';
import { PlusIcon, DeleteIcon, SparklesIcon, CheckIcon, UploadIcon } from '../Icons';
import { getToken } from '../../services/authService';

interface CoursePortalCreatorProps {
    onCreateCourse: (subject: string, modules: CourseModule[]) => Promise<any>;
    onCancel: () => void;
    onRefreshCourses?: () => void;
}


interface LectureDraft {
    id: string;
    title: string;
    outline: string;
    file: File | null;
    isGenerating: boolean;
    isUploaded: boolean;
}

const CoursePortalCreator: React.FC<CoursePortalCreatorProps> = ({ onCreateCourse, onCancel, onRefreshCourses }) => {

    const [subject, setSubject] = useState('');
    const [numLectures, setNumLectures] = useState(5);
    const [lectures, setLectures] = useState<LectureDraft[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState('');

    // Initialize lectures when numLectures changes
    useEffect(() => {
        setLectures(prev => {
            const next = [...prev];
            if (next.length < numLectures) {
                for (let i = next.length; i < numLectures; i++) {
                    next.push({
                        id: `lec-${Date.now()}-${i}`,
                        title: '',
                        outline: '',
                        file: null,
                        isGenerating: false,
                        isUploaded: false
                    });
                }
            } else if (next.length > numLectures) {
                return next.slice(0, numLectures);
            }
            return next;
        });
    }, [numLectures]);

    const updateLecture = (id: string, updates: Partial<LectureDraft>) => {
        setLectures(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const handleGenerateOutline = async (lec: LectureDraft) => {
        if (!subject.trim()) return alert('Please enter a course subject first.');
        if (!lec.title.trim()) return alert('Please enter a lecture title first.');

        updateLecture(lec.id, { isGenerating: true });
        try {
            const res = await fetch('/api/ai/generate-topic-outlines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ topics: [lec.title], subject })
            });
            if (res.ok) {
                const data = await res.json();
                // Robust lookup: try exact match, then try the first key available if we only sent one topic
                let outline = data.outlines?.[lec.title];
                if (!outline && data.outlines) {
                    const keys = Object.keys(data.outlines);
                    if (keys.length > 0) outline = data.outlines[keys[0]];
                }
                updateLecture(lec.id, { outline: outline || 'AI failed to generate a specific outline for this topic.' });
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(`Failed to generate outline: ${errData.error || 'Unknown server error'}`);
            }
        } catch (e: any) {
            console.error(e);
            alert(`Error generating outline: ${e?.message || 'Check your connection'}`);
        } finally {

            updateLecture(lec.id, { isGenerating: false });
        }
    };

    const handleCreatePortal = async () => {
        if (!subject.trim()) return alert('Please enter a course subject.');
        if (lectures.some(l => !l.title.trim())) return alert('Please provide titles for all lectures.');

        setIsSaving(true);
        setStatus('Creating course structure...');
        try {
            const token = getToken();

            // 1. Create the course first with one main module
            const topics = lectures.map(l => l.title);
            const topicOutlines = lectures.reduce((acc, l) => ({ ...acc, [l.title]: l.outline }), {});

            const mainModule: CourseModule = {
                id: `mod-main-${Date.now()}`,
                title: 'Course Content',
                description: `Curriculum for ${subject}`,
                topics: topics,
                topicOutlines: topicOutlines,
                lectures: [],
                materialIds: {}
            };

            const course = await onCreateCourse(subject, [mainModule]);
            const courseId = course.id;
            const moduleId = mainModule.id;

            // 2. Parallel Upload/Link PDFs
            setStatus('Uploading all lecture materials in parallel...');
            console.log('[CoursePortal] Starting uploads - Course ID:', courseId, 'Module ID:', moduleId);

            const uploadPromises = lectures.map(async (lec) => {
                if (lec.file) {
                    console.log('[CoursePortal] Uploading:', lec.title);
                    const formData = new FormData();
                    formData.append('file', lec.file);
                    formData.append('courseId', courseId);
                    formData.append('moduleId', moduleId);
                    formData.append('title', lec.title.trim());

                    const uploadRes = await fetch('/api/materials/upload-raw', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });

                    if (uploadRes.ok) {
                        const data = await uploadRes.json();
                        console.log('[CoursePortal] ✓ Uploaded:', lec.title, 'ID:', data.id);
                    } else {
                        const errorText = await uploadRes.text();
                        console.error('[CoursePortal] ✗ Failed:', lec.title, 'Status:', uploadRes.status, 'Error:', errorText);
                    }
                }
            });

            await Promise.all(uploadPromises);
            console.log('[CoursePortal] All uploads complete');


            setStatus('Success!');
            if (onRefreshCourses) onRefreshCourses();
            setTimeout(() => onCancel(), 1000);

        } catch (e) {
            console.error(e);
            alert('Failed to create course portal.');
        } finally {
            setIsSaving(false);
            setStatus('');
        }
    };

    return (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-black text-black tracking-tight">Course Portal Architect</h2>
                    <p className="text-gray-500 mt-1 text-lg">Define your curriculum and upload lecture materials.</p>
                </div>
                <div className="bg-black text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-black/20">
                    Teacher Panel
                </div>
            </div>

            <div className="space-y-10">
                {/* Global Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="md:col-span-2 space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-gray-400">Course Name / Subject</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g. Modern Web Development"
                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xl placeholder:text-gray-300 focus:bg-white focus:ring-2 focus:ring-black outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-gray-400">Number of Lectures</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="1"
                                max="20"
                                value={numLectures}
                                onChange={(e) => setNumLectures(parseInt(e.target.value) || 1)}
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xl font-bold focus:bg-white focus:ring-2 focus:ring-black outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Lecture List */}
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-black flex items-center gap-2">
                        <div className="w-1 h-6 bg-black rounded-full"></div>
                        Lecture Details
                    </h3>

                    <div className="grid gap-4">
                        {lectures.map((lec, idx) => (
                            <div key={lec.id} className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-black/50 transition-all shadow-sm">
                                <div className="flex flex-col lg:flex-row gap-6">
                                    {/* Left: Index & Title */}
                                    <div className="flex-1 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-bold shadow-md">
                                                {idx + 1}
                                            </div>
                                            <input
                                                type="text"
                                                value={lec.title}
                                                onChange={(e) => updateLecture(lec.id, { title: e.target.value })}
                                                placeholder="Lecture Title (e.g. Introduction to React)"
                                                className="flex-1 bg-transparent border-b-2 border-gray-100 py-2 font-bold text-lg focus:border-black outline-none transition-colors"
                                            />
                                        </div>

                                        <div className="relative">
                                            <textarea
                                                value={lec.outline}
                                                onChange={(e) => updateLecture(lec.id, { outline: e.target.value })}
                                                placeholder="Enter lecture outline manually or generate with AI..."
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl text-sm min-h-[100px] resize-none focus:bg-white focus:ring-2 focus:ring-black outline-none transition-all"
                                            />
                                            <button
                                                onClick={() => handleGenerateOutline(lec)}
                                                disabled={lec.isGenerating}
                                                className="absolute bottom-3 right-3 p-2 bg-gray-100 text-black rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-xs font-bold"
                                            >
                                                {lec.isGenerating ? (
                                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                                ) : (
                                                    <SparklesIcon className="w-4 h-4" />
                                                )}
                                                AI Generate
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right: File Upload */}
                                    <div className="lg:w-64 flex flex-col justify-center items-center gap-4 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                        <div className="text-center">
                                            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 ${lec.file ? 'bg-black text-white shadow-sm' : 'bg-gray-100 text-gray-600'}`}>
                                                {lec.file ? <CheckIcon className="w-6 h-6" /> : <UploadIcon className="w-6 h-6" />}
                                            </div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                                {lec.file ? 'PDF Ready' : 'Upload PDF'}
                                            </p>
                                        </div>

                                        <input
                                            type="file"
                                            id={`file-${lec.id}`}
                                            className="hidden"
                                            accept=".pdf"
                                            onChange={(e) => updateLecture(lec.id, { file: e.target.files?.[0] || null })}
                                        />

                                        <label
                                            htmlFor={`file-${lec.id}`}
                                            className="w-full py-2 bg-white border border-gray-200 rounded-xl text-xs font-black text-center cursor-pointer hover:bg-gray-50 hover:border-black transition-all shadow-sm"
                                        >
                                            {lec.file ? 'Change File' : 'Browse Files'}
                                        </label>

                                        {lec.file && (
                                            <p className="text-[10px] text-gray-400 truncate w-full text-center">
                                                {lec.file.name}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col md:flex-row gap-4 pt-10 border-t border-gray-200">
                    <Button
                        className="flex-1 py-5 rounded-2xl text-lg font-black shadow-xl shadow-black/20"
                        onClick={handleCreatePortal}
                        disabled={isSaving || !subject}
                    >
                        {isSaving ? (
                            <div className="flex items-center justify-center gap-3">
                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                {status}
                            </div>
                        ) : 'Create Course Portal'}
                    </Button>
                    <Button
                        variant="secondary"
                        className="px-10 py-5 rounded-2xl text-lg font-bold border-2"
                        onClick={onCancel}
                        disabled={isSaving}
                    >
                        Discard
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CoursePortalCreator;
