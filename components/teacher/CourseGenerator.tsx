import React, { useState } from 'react';
import Button from '../common/Button';
import { SparklesIcon, PlusIcon, ChevronRightIcon } from '../Icons';
import { getToken } from '../../services/authService';
import type { CourseModule } from '../../types';

interface CourseGeneratorProps {
    onCreateCourse: (subject: string, modules: CourseModule[]) => Promise<any>;
    onCancel: () => void;
    onRefreshCourses?: () => void;
}

const CourseGenerator: React.FC<CourseGeneratorProps> = ({ onCreateCourse, onCancel, onRefreshCourses }) => {
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [subject, setSubject] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [genStatus, setGenStatus] = useState<string>('');
    const [generatedModules, setGeneratedModules] = useState<CourseModule[]>([]);

    const handleGenerateSyllabus = async () => {
        if (!subject.trim()) return;
        setIsLoading(true);
        setGenStatus('Architecting modules...');
        try {
            const res = await fetch('/api/ai/generate-course-outline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ subject })
            });
            const data = await res.json();
            if (data.modules) {
                const mapped: CourseModule[] = data.modules.map((m: any) => {
                    const topicOutlines: Record<string, string> = {};
                    const topics: string[] = [];

                    if (m.topics) {
                        m.topics.forEach((t: any) => {
                            const title = typeof t === 'string' ? t : t.title;
                            const outline = typeof t === 'string' ? "" : (t.outline || "");
                            topics.push(title);
                            if (outline) topicOutlines[title] = outline;
                        });
                    }

                    return {
                        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        title: m.title,
                        description: m.description,
                        topics: topics,
                        topicOutlines: topicOutlines,
                        lectures: []
                    };
                });

                setGeneratedModules(mapped);
                setStep('preview');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to generate syllabus.');
        } finally {
            setIsLoading(false);
            setGenStatus('');
        }
    };

    const handleConfirmAndGenerateAll = async () => {
        setIsLoading(true);
        setGenStatus('Finalizing course & generating study materials...');
        try {
            const course = await onCreateCourse(subject, generatedModules);
            // Parallel generate PDFs for all lectures
            const generationPromises: Promise<any>[] = [];
            for (const module of generatedModules) {
                for (const topic of (module.topics || [])) {
                    const outline = module.topicOutlines?.[topic] || "";
                    generationPromises.push(
                        fetch(`/api/courses/${course.id}/modules/${module.id}/generate-notes`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                            body: JSON.stringify({ topic, outline })
                        })
                    );
                }
            }
            await Promise.all(generationPromises);
            onRefreshCourses?.();
            onCancel();
        } catch (e) {
            console.error(e);
            alert('Partial success: course created but material generation failed.');
        } finally {
            setIsLoading(false);
            setGenStatus('');
        }
    };

    const updateTopicOutline = (moduleId: string, topic: string, outline: string) => {
        setGeneratedModules(prev => prev.map(m => {
            if (m.id === moduleId) {
                return { ...m, topicOutlines: { ...(m.topicOutlines || {}), [topic]: outline } };
            }
            return m;
        }));
    };

    const updateTopicTitle = (moduleId: string, oldTitle: string, newTitle: string) => {
        setGeneratedModules(prev => prev.map(m => {
            if (m.id === moduleId) {
                const nextTopics = (m.topics || []).map(t => t === oldTitle ? newTitle : t);
                const nextOutlines = { ...(m.topicOutlines || {}) };
                if (nextOutlines[oldTitle]) {
                    nextOutlines[newTitle] = nextOutlines[oldTitle];
                    delete nextOutlines[oldTitle];
                }
                return { ...m, topics: nextTopics, topicOutlines: nextOutlines };
            }
            return m;
        }));
    };

    if (step === 'input') {
        return (
            <div className="bg-black border border-gray-800 rounded-3xl p-10 text-white relative overflow-hidden shadow-2xl animate-fade-in">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-white/10 rounded-2xl">
                            <SparklesIcon className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tight">AI Course Architect</h2>
                    </div>
                    <p className="text-gray-400 text-lg mb-10 max-w-xl">Enter a subject and our AI will architect a multi-week curriculum complete with lecture summaries and textbooks.</p>

                    <div className="space-y-4 max-w-2xl">
                        <label className="block text-xs font-black uppercase tracking-[0.2em] text-gray-500">Course Subject</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g. Distributed Systems or Quantum Mechanics"
                            className="w-full p-6 bg-white/5 border border-white/10 rounded-2xl text-xl placeholder:text-gray-600 focus:bg-white focus:text-gray-900 outline-none transition-all shadow-inner"
                        />
                        <div className="flex gap-4 pt-6">
                            <Button className="flex-1 py-5 rounded-2xl font-bold shadow-xl shadow-black/20" onClick={handleGenerateSyllabus} disabled={isLoading || !subject}>
                                {isLoading ? (
                                    <div className="flex items-center justify-center gap-3">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {genStatus}
                                    </div>
                                ) : "Architect Syllabus"}
                            </Button>
                            <Button variant="secondary" className="px-8 border-2" onClick={onCancel} disabled={isLoading}>Cancel</Button>
                        </div>
                    </div>
                </div>
                <div className="absolute right-[-10%] top-[-20%] w-[50%] h-[150%] bg-white/5 blur-[120px] rounded-full rotate-45" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
                <div className="flex justify-between items-start mb-8 border-b border-gray-100 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-black tracking-tight">Syllabus Preview</h2>
                        <p className="text-gray-500 mt-2">Refine the architecture before generating all study guides.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStep('input')} className="rounded-xl border-2">Back</Button>
                        <Button
                            className="rounded-xl font-bold shadow-lg shadow-black/20"
                            onClick={handleConfirmAndGenerateAll}
                            disabled={isLoading || genStatus.includes('brainstorming')}
                        >
                            {isLoading ? genStatus : "Confirm & Generate All PDFs"}
                        </Button>
                    </div>
                </div>

                <div className="space-y-8">
                    {generatedModules.map((module, mIdx) => (
                        <div key={module.id} className="group bg-gray-50/50 border border-gray-200 rounded-2xl p-6 hover:border-black/30 transition-all">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center font-bold shadow-lg">W{mIdx + 1}</div>
                                <div>
                                    <h3 className="text-xl font-bold text-black">{module.title}</h3>
                                    <p className="text-sm text-gray-500">{module.description}</p>
                                </div>
                            </div>

                            <div className="pl-6 space-y-6 border-l-2 border-gray-200">
                                {(module.topics || []).map((lectureTitle, lIdx) => (
                                    <div key={lIdx} className="space-y-3 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">Lecture {lIdx + 1}</span>
                                            <input
                                                value={lectureTitle}
                                                onChange={(e) => updateTopicTitle(module.id, lectureTitle, e.target.value)}
                                                className="font-bold text-black bg-transparent border-none focus:ring-0 p-0 w-full"
                                            />
                                        </div>
                                        <textarea
                                            value={module.topicOutlines?.[lectureTitle] || ""}
                                            onChange={(e) => updateTopicOutline(module.id, lectureTitle, e.target.value)}
                                            placeholder={isLoading ? "AI is brainstorming details..." : "Lecture outline (used for AI textbook generation)..."}
                                            className={`w-full text-sm p-4 bg-gray-50/50 border border-gray-100 rounded-xl min-h-[140px] resize-none focus:bg-white focus:ring-2 focus:ring-black transition-all ${!module.topicOutlines?.[lectureTitle] ? 'animate-pulse' : ''}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CourseGenerator;
