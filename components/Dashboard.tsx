import React, { useEffect, useMemo, useState } from 'react';
import type { User, Course, CourseModule, VideoDraft, AppView } from '../types';
import { Role } from '../types';
import Button from './common/Button';
import { DeleteIcon, SparklesIcon, QuestionIcon, ChevronRightIcon, ChevronLeftIcon, PlusIcon, VideoIcon } from './Icons';
import Loader from './common/Loader';
import ManualCourseCreator from './teacher/ManualCourseCreator';
import CoursePortalCreator from './teacher/CoursePortalCreator';
import VisualAIPlayer from './student/VisualAIPlayer';

import { generateCourseModules } from '../services/geminiService';
import { deleteCourse as apiDeleteCourse, updateCourse as apiUpdateCourse } from '../services/coursesService';
import { uploadMaterial, listMaterials } from '../services/materialsService';
import { generateQuiz, generatePdfQuiz, submitQuiz, getAttemptsSummary, getLastAttempt } from '../services/quizService';
import { generateExercise, saveExercise } from '../services/exerciseService';
import { getToken } from '../services/authService';

interface DashboardProps {
    user: User;
    courses: Course[];
    currentView?: AppView;
    onSelectLecture: (lecture: VideoDraft) => void;
    onCreateCourse: (subject: string, modules: CourseModule[]) => Promise<any>;
    onGenerateLectureClick: (course: Course, module: CourseModule, topic?: string) => void;
    onDeleteLecture: (courseId: string, moduleId: string, lectureId: string) => void;
    enrolledCourseIds: string[];
    onEnrollCourse: (courseId: string) => void;
    onWithdrawCourse?: (courseId: string) => void;
    onUpdateModuleTopics: (courseId: string, moduleId: string, topics: string[], topicOutlines?: Record<string, string>) => void;
    onRefreshCourses?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, courses, currentView, onSelectLecture, onCreateCourse, onGenerateLectureClick, onDeleteLecture, enrolledCourseIds, onEnrollCourse, onWithdrawCourse, onUpdateModuleTopics, onRefreshCourses }) => {
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
    const [isCreatingCourse, setIsCreatingCourse] = useState(false);
    const [creationMode, setCreationMode] = useState<'none' | 'ai' | 'manual' | 'portal'>('none');
    const [editingPortalCourse, setEditingPortalCourse] = useState<Course | null>(null);
    const [visualAI, setVisualAI] = useState<{
        materialId: string;
        topic: string;
        courseId: string;
        moduleId: string;
    } | null>(null);


    const toggleCourse = (courseId: string) => {
        setExpandedCourses(prev => ({ ...prev, [courseId]: !prev[courseId] }));
    };



    const handleSaveNewCourse = async (subject: string, modules: CourseModule[]) => {
        try {
            const course = await onCreateCourse(subject, modules);
            setIsCreatingCourse(false);
            return course;
        } catch (e: any) {
            console.error(e);
            alert(e.message || 'Failed to save course.');
            throw e;
        }
    };
    const [newCourseSubject, setNewCourseSubject] = useState('');
    const [isLoadingModules, setIsLoadingModules] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [moduleFiles, setModuleFiles] = useState<Record<string, File | null>>({});
    const [materialsByModule, setMaterialsByModule] = useState<Record<string, Array<{ id: string; title: string; size: number; mime: string; indexed: boolean; createdAt: string }>>>({});
    const [draftCourse, setDraftCourse] = useState<{ subject: string; modules: CourseModule[] } | null>(null);
    const [catalogQuery, setCatalogQuery] = useState('');
    const [attemptsByCourse, setAttemptsByCourse] = useState<Record<string, number>>({});
    const [lastByModule, setLastByModule] = useState<Record<string, { score: number; total: number; createdAt: string }>>({});
    const [activeQuiz, setActiveQuiz] = useState<{
        courseId: string;
        moduleId: string;
        quizId: string;
        questions: Array<{
            type?: 'mcq' | 'short' | 'programming';
            question: string;
            options: string[];
            correctAnswer: string;
            difficulty?: string;
            points?: number;
            explanation?: string;
        }>;
        answers: Array<number | string | null>;
        submitting: boolean;
        endAt: number;
        left: number;
        error?: string;
        isFullscreen?: boolean;
        topic?: string;
        result?: any;
    } | null>(null);

    const [activeExercise, setActiveExercise] = useState<{
        courseId: string;
        moduleId: string;
        topic: string;
        materialId: string;
        title: string;
        description: string;
        requirements: string[];
        learningObjectives: string[];
        portfolioTip: string;
        isLoading: boolean;
        error?: string;
    } | null>(null);

    const myCourses = useMemo(() => courses.filter(c => enrolledCourseIds.includes(c.id)), [courses, enrolledCourseIds]);
    const [selCourseId, setSelCourseId] = useState<string>('');
    const [selModuleId, setSelModuleId] = useState<string>('');
    const selCourse = useMemo(() => myCourses.find(c => c.id === selCourseId), [myCourses, selCourseId]);
    const selModule = useMemo(() => selCourse?.modules.find(m => m.id === selModuleId), [selCourse, selModuleId]);
    const [customTopic, setCustomTopic] = useState('');
    const [customFile, setCustomFile] = useState<File | null>(null);
    const [isUp, setIsUp] = useState(false);

    const handleDeleteCourse = async (courseId: string) => {
        if (!window.confirm('Delete this course and all associated data? This cannot be undone.')) return;
        try {
            await apiDeleteCourse(courseId);
            onRefreshCourses?.();
        } catch (e) {
            alert('Failed to delete course');
        }
    };

    const [filter, setFilter] = useState('');

    const allVideos = useMemo(() => {
        const vids: Array<{ v: VideoDraft; course: Course; module: CourseModule }> = [];
        courses.forEach(course => {
            if (!enrolledCourseIds.includes(course.id)) return;
            course.modules.forEach(module => {
                module.lectures.forEach(v => vids.push({ v, course, module }));
            });
        });
        return vids;
    }, [courses, enrolledCourseIds]);

    const toggleModule = (moduleId: string) => {
        setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
    };

    useEffect(() => {
        if (user.role !== Role.Student) return;
        (async () => {
            try { setAttemptsByCourse(await getAttemptsSummary()); } catch { setAttemptsByCourse({}); }
        })();
    }, [user.role]);

    const startQuiz = async (courseId: string, moduleId: string) => {
        try {
            const q = await generateQuiz(courseId, moduleId);
            const endAt = Date.now() + 5 * 60 * 1000; // 5 minutes for short quiz
            setActiveQuiz({ courseId, moduleId, quizId: q.id, questions: q.questions, answers: new Array(q.questions.length).fill(null), submitting: false, endAt, left: 5 * 60 });
        } catch (e: any) {
            setActiveQuiz({ courseId, moduleId, quizId: '', questions: [], answers: [], submitting: false, endAt: 0, left: 0, error: String(e?.message || 'Failed to generate quiz') });
        }
    };

    const startTopicQuiz = async (courseId: string, moduleId: string, topic: string, materialId?: string) => {
        try {
            alert('Generating comprehensive quiz from PDF content... This may take a moment.');
            const quiz = await generatePdfQuiz(courseId, moduleId, topic, materialId, 10);
            const endAt = Date.now() + 15 * 60 * 1000; // 15 minutes for detailed quiz

            // Enter fullscreen mode
            try {
                await document.documentElement.requestFullscreen();
            } catch (err) {
                console.log('Fullscreen not supported or denied');
            }

            setActiveQuiz({
                courseId,
                moduleId,
                quizId: quiz.id,
                questions: quiz.questions.map(q => ({
                    ...q,
                    options: q.options || []
                })) as any,
                answers: new Array(quiz.questions.length).fill(null),
                submitting: false,
                endAt,
                left: 15 * 60,
                isFullscreen: true,
                topic
            });
        } catch (e: any) {
            alert(`Failed to generate quiz: ${e?.message || 'Unknown error'}`);
        }
    };

    const startExercise = async (courseId: string, moduleId: string, topic: string, materialId: string) => {
        try {
            setActiveExercise({
                courseId,
                moduleId,
                topic,
                materialId,
                title: '',
                description: '',
                requirements: [],
                learningObjectives: [],
                portfolioTip: '',
                isLoading: true
            });

            // Enter fullscreen mode
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) { }

            const ex = await generateExercise({ courseId, moduleId, topic, materialId });
            setActiveExercise(prev => prev ? { ...prev, ...ex, isLoading: false } : null);
        } catch (e: any) {
            setActiveExercise(prev => prev ? { ...prev, isLoading: false, error: e.message || 'Failed to generate exercise' } : null);
        }
    };

    const handleSaveExercise = async () => {
        if (!activeExercise || activeExercise.isLoading) return;
        try {
            const { courseId, moduleId, topic, title, description, requirements, learningObjectives, portfolioTip } = activeExercise;
            await saveExercise({
                courseId,
                moduleId,
                topic,
                exercise: { title, description, requirements, learningObjectives, portfolioTip }
            });
            alert('Exercise saved to your library! You can complete it later.');
            if (document.fullscreenElement) {
                try { await document.exitFullscreen(); } catch (err) { }
            }
            setActiveExercise(null);
        } catch (e: any) {
            alert('Failed to save exercise: ' + e.message);
        }
    };

    const setAnswer = (idx: number, val: number | string) => {
        setActiveQuiz(prev => prev ? { ...prev, answers: prev.answers.map((a, i) => i === idx ? val : a) } : prev);
    };

    const submitActiveQuiz = async () => {
        if (!activeQuiz) return;
        const a = activeQuiz;
        try {
            setActiveQuiz({ ...a, submitting: true });
            const result = await submitQuiz({
                courseId: a.courseId,
                moduleId: a.moduleId,
                quizId: a.quizId,
                questions: a.questions,
                answers: a.answers
            });

            // Storing results instead of just alerting
            setActiveQuiz({ ...a, result, submitting: false });

            try { setAttemptsByCourse(await getAttemptsSummary()); } catch { }
            try { const last = await getLastAttempt(a.courseId, a.moduleId); if (last) setLastByModule(prev => ({ ...prev, [a.moduleId]: last })); } catch { }
        } catch (err) {
            console.error('Quiz submission error:', err);
            alert('Failed to submit quiz. Please try again.');
            setActiveQuiz({ ...a, submitting: false });
        }
    };



    useEffect(() => {
        if (!activeQuiz || !activeQuiz.endAt) return;
        const id = setInterval(() => {
            setActiveQuiz(prev => {
                if (!prev) return prev;
                const left = Math.max(0, Math.floor((prev.endAt - Date.now()) / 1000));
                return { ...prev, left };
            });
        }, 1000);
        return () => clearInterval(id);
    }, [activeQuiz?.quizId]);

    useEffect(() => {
        if (activeQuiz && activeQuiz.left === 0 && !activeQuiz.submitting && activeQuiz.questions.length) {
            submitActiveQuiz();
        }
    }, [activeQuiz?.left]);

    // Loading materials for all modules in enrolled courses (student view)
    useEffect(() => {
        if (user.role !== Role.Student) return;
        const loadAllMaterials = async () => {
            const materialsMap: Record<string, Array<{ id: string; title: string; size: number; mime: string; indexed: boolean; createdAt: string }>> = {};
            for (const course of myCourses) {
                for (const module of course.modules) {
                    try {
                        const response = await listMaterials(course.id, module.id);
                        materialsMap[module.id] = response.materials || [];
                    } catch (e) {
                        console.error(`Failed to load materials for module ${module.id}:`, e);
                    }
                }
            }
            setMaterialsByModule(materialsMap);
        };
        if (myCourses.length > 0) {
            loadAllMaterials();
        }
    }, [user.role, myCourses.length, courses]);

    const addTopic = (courseId: string, module: CourseModule) => {
        const value = (topicInputs[module.id] || '').trim();
        if (!value) return;
        const next = Array.from(new Set([...(module.topics || []), value]));
        onUpdateModuleTopics(courseId, module.id, next, module.topicOutlines);
        setTopicInputs(prev => ({ ...prev, [module.id]: '' }));
    };

    const removeTopic = (courseId: string, module: CourseModule, topic: string) => {
        const next = (module.topics || []).filter(t => t !== topic);
        const nextOutlines = { ...(module.topicOutlines || {}) };
        delete nextOutlines[topic];
        onUpdateModuleTopics(courseId, module.id, next, nextOutlines);
    };

    const generateOutlines = async (courseId: string, module: CourseModule, courseTitle: string) => {
        const topics = module.topics || [];
        if (topics.length === 0) return alert('No topics to generate outlines for.');

        try {
            setUploading(prev => ({ ...prev, [module.id + '_outlines']: true }));
            const res = await fetch('/api/ai/generate-topic-outlines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ topics, subject: courseTitle })
            });
            if (res.ok) {
                const data = await res.json();
                onUpdateModuleTopics(courseId, module.id, topics, data.outlines || {});
                alert('Lecture outlines generated successfully!');
            } else {
                alert('Failed to generate outlines');
            }
        } catch (e) {
            console.error(e);
            alert('Error generating outlines');
        } finally {
            setUploading(prev => ({ ...prev, [module.id + '_outlines']: false }));
        }
    };

    const updateTopicOutline = (courseId: string, module: CourseModule, topic: string, outline: string) => {
        const nextOutlines = { ...(module.topicOutlines || {}), [topic]: outline };
        onUpdateModuleTopics(courseId, module.id, module.topics || [], nextOutlines);
    };

    const loadMaterials = async (courseId: string, moduleId: string) => {
        try {
            const res = await listMaterials(courseId, moduleId);
            setMaterialsByModule(prev => ({ ...prev, [moduleId]: res.materials }));
        } catch { }
    };

    const teacherCourses = useMemo(() => courses.filter(c => !c.creatorId || c.creatorId === user.id), [courses, user.id]);

    const renderTeacherOverview = () => (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-black">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div>
                        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Courses</p>
                        <p className="text-4xl font-bold text-black mt-2">{teacherCourses.length}</p>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-black font-medium">
                        View Details <ChevronRightIcon className="w-4 h-4 ml-1" />
                    </div>
                </div>

                <div className="col-span-1 md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-black mb-4 border-b border-gray-100 pb-2">Recent Courses</h3>
                    {teacherCourses.length ? (
                        <div className="space-y-3">
                            {teacherCourses.slice(0, 3).map(c => (
                                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                    <span className="font-medium text-gray-700">{c.title}</span>
                                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">{c.modules.length} Modules</span>
                                </div>
                            ))}
                            {teacherCourses.length > 3 && (
                                <p className="text-sm text-gray-500 text-center mt-2">+{teacherCourses.length - 3} more courses</p>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <p className="text-muted-foreground mb-4">No courses created yet.</p>
                            <Button size="sm" onClick={() => setCreationMode('manual')}>Create Your First Course</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderTeacherCourseMgmt = () => {
        if (creationMode === 'manual') {
            return (
                <ManualCourseCreator
                    onCreateCourse={async (subject, modules) => {
                        await handleSaveNewCourse(subject, modules);
                        setCreationMode('none');
                    }}
                    onCancel={() => setCreationMode('none')}
                />
            );
        }

        if (creationMode === 'portal') {
            return (
                <CoursePortalCreator
                    initialCourse={editingPortalCourse || undefined}
                    initialMaterials={editingPortalCourse ? materialsByModule[editingPortalCourse.modules[0]?.id] : undefined}
                    onCreateCourse={handleSaveNewCourse}
                    onUpdateCourse={async (courseId: string, title?: string, description?: string) => {
                        await apiUpdateCourse(courseId, { title, description });
                        onRefreshCourses?.();
                    }}
                    onUpdateModuleTopics={onUpdateModuleTopics}
                    onCancel={() => {
                        setCreationMode('none');
                        setEditingPortalCourse(null);
                    }}
                    onRefreshCourses={onRefreshCourses}
                />
            );
        }

        return (

            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div>
                        <h2 className="text-2xl font-bold text-black">Your Courses</h2>
                        <p className="text-gray-500">Manage curriculum and content.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setCreationMode('portal')}>
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Course Portal
                        </Button>
                    </div>
                </div>

                <div className="relative">
                    <input
                        className="w-full p-3 pl-4 bg-white border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-black focus:border-black outline-none transition-all"
                        placeholder="Search your courses..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>

                {courses.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                        <p className="mb-4 text-lg">You haven't created any courses yet.</p>
                        <Button variant="outline" onClick={() => setCreationMode('portal')}>Open Course Portal</Button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {courses.filter(c => c.title.toLowerCase().includes(filter.toLowerCase())).map(course => (
                            <div key={course.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start p-5 cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={() => toggleCourse(course.id)}>
                                        <div className="flex-1 pr-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-xl font-bold text-black">{course.title}</h3>
                                                <span className={`transform transition-transform duration-200 ${expandedCourses[course.id] ? 'rotate-90' : ''}`}>
                                                    <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 line-clamp-2">{course.description}</p>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <Button size="sm" variant="outline" onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingPortalCourse(course);
                                                setCreationMode('portal');
                                            }}>
                                                Edit
                                            </Button>
                                            <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteCourse(course.id); }}>
                                                <DeleteIcon className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                {expandedCourses[course.id] && (
                                    <div className="pl-4 border-l-2 border-border space-y-4">
                                        {course.modules.length > 0 ? (
                                            course.modules.map(module => (
                                                <div key={module.id} className="bg-secondary/10 rounded-md p-3">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div>
                                                            <h4 className="font-semibold">{module.title}</h4>
                                                            <p className="text-xs text-muted-foreground">{module.description}</p>
                                                        </div>
                                                        <Button variant="secondary" size="sm" onClick={() => {
                                                            toggleModule(module.id);
                                                            loadMaterials(course.id, module.id);
                                                        }}>
                                                            {expandedModules[module.id] ? 'Hide' : 'Manage'}
                                                        </Button>
                                                    </div>
                                                    {expandedModules[module.id] && (
                                                        <div className="mt-4 pt-4 border-t border-border space-y-4">
                                                            <div className="space-y-4">
                                                                {(module.topics || []).map((topic, tidx) => {
                                                                    let matchedMaterial = null;
                                                                    if (materialsByModule[module.id]) {
                                                                        const materials = materialsByModule[module.id];
                                                                        matchedMaterial = materials.find(m => m.title === topic) || materials.find(m => m.title.toLowerCase() === topic.toLowerCase()) || materials.find(m => m.title.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(m.title.toLowerCase()));
                                                                    }
                                                                    return (
                                                                    <div key={tidx} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                                                                        <h5 className="font-bold text-black text-lg mb-3">{topic}</h5>
                                                                        {module.topicOutlines?.[topic] && (
                                                                            <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                                                                                {module.topicOutlines[topic]}
                                                                            </p>
                                                                        )}
                                                                        {matchedMaterial && (
                                                                            <div className="mt-4 flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                                                <a href={`/api/materials/${matchedMaterial.id}/download`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-2">
                                                                                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                                    {matchedMaterial.title}
                                                                                </a>
                                                                                <span className="text-[10px] text-black font-bold uppercase tracking-widest bg-white px-2 py-0.5 rounded shadow-sm border border-black/10">PDF</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-muted-foreground p-4">No modules found.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };


    const renderStudentMyCourses = () => {
        const myCourses = courses.filter(c => enrolledCourseIds.includes(c.id));
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold text-black tracking-tight">My Courses</h2>
                    {onRefreshCourses && (
                        <Button size="sm" variant="secondary" onClick={onRefreshCourses}>Refresh</Button>
                    )}
                </div>
                {myCourses.length > 0 ? (
                    <div className="space-y-10">
                        {myCourses.map(course => (
                            <div key={course.id} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                                <div className="flex items-start justify-between mb-8 border-b border-gray-100 pb-6">
                                    <div>
                                        <h3 className="text-3xl font-bold text-black">{course.title}</h3>
                                        <p className="text-gray-500 mt-2">{course.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-black/5 text-black border border-black/10 uppercase tracking-widest">Enrolled</span>
                                        {onWithdrawCourse && (
                                            <button
                                                className="text-xs font-bold px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 uppercase tracking-widest transition-colors hover:bg-red-100"
                                                onClick={() => {
                                                    if (window.confirm('Are you sure you want to unenroll from this subject?')) {
                                                        onWithdrawCourse(course.id);
                                                    }
                                                }}
                                            >
                                                Unenroll
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {course.modules.map((module, mIdx) => (
                                        <div key={module.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                            <div className="flex justify-between items-center p-6 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => { toggleModule(module.id); loadMaterials(course.id, module.id); }}>
                                                <div className="flex items-center gap-5">
                                                    <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center font-bold text-lg shadow-lg">W{mIdx + 1}</div>
                                                    <div>
                                                        <h4 className="text-xl font-bold text-black">{module.title}</h4>
                                                        <p className="text-sm text-gray-500 line-clamp-1">{module.description}</p>
                                                    </div>
                                                </div>
                                                <span className={`transform transition-transform text-gray-400 ${expandedModules[module.id] ? 'rotate-180' : ''}`}>
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                </span>
                                            </div>

                                            {expandedModules[module.id] && (
                                                <div className="border-t border-gray-100 bg-gray-50/20 p-6 space-y-6">
                                                    <div className="space-y-3">
                                                        <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Weekly Curriculum</h5>

                                                        {(!module.lectures?.length && !module.topics?.length) && (
                                                            <p className="text-sm text-gray-400 italic text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">Weekly content is currently being architected.</p>
                                                        )}

                                                        {module.lectures?.map(lecture => (
                                                            <div key={lecture.id} className="flex justify-between items-center p-5 rounded-2xl bg-white border border-gray-200 group hover:border-black transition-all shadow-sm">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="p-3 bg-gray-100 rounded-xl text-gray-500 group-hover:bg-black/5 group-hover:text-black transition-colors">
                                                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-black text-lg">{lecture.title}</p>
                                                                        <div className="flex items-center gap-4 mt-1">
                                                                            <p className="text-xs text-gray-500">{lecture.summary || 'Interactive Lecture'}</p>
                                                                            {lecture.pdfId && (
                                                                                <a href={`/api/materials/${lecture.pdfId}/download`} target="_blank" rel="noreferrer" className="text-xs font-bold text-black flex items-center gap-1 hover:underline">
                                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                                                                    Reference PDF
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button onClick={() => onSelectLecture(lecture)} className="rounded-xl shadow-md">Study Now</Button>
                                                            </div>
                                                        ))}

                                                        {module.topics?.map((topic, tidx) => {
                                                            const sanitized = topic.replace(/[^a-zA-Z0-9]/g, '_');
                                                            let pdfId = module.materialIds?.[sanitized] || module.materialIds?.[topic];

                                                            if (!pdfId && materialsByModule[module.id]) {
                                                                const materials = materialsByModule[module.id];
                                                                let match = materials.find(m => m.title === topic) || materials.find(m => m.title.toLowerCase() === topic.toLowerCase());
                                                                if (!match) {
                                                                    match = materials.find(m => m.title.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(m.title.toLowerCase()));
                                                                }
                                                                pdfId = match?.id;
                                                            }
                                                            return (
                                                                <div key={tidx} className="flex justify-between items-center p-5 rounded-2xl bg-white border border-gray-200 group hover:border-black transition-all shadow-sm">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="p-3 bg-gray-100 rounded-xl text-gray-500 group-hover:bg-black/5 group-hover:text-black transition-colors">
                                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                                                        </div>
                                                                        <div>
                                                                            <p className="font-bold text-black text-lg">{topic}</p>
                                                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                                {pdfId ? (
                                                                                    <>
                                                                                        <a href={`/api/materials/${pdfId}/download`} target="_blank" rel="noreferrer" className="text-xs font-bold text-black border border-black/10 bg-black/5 px-2 py-1 rounded-lg flex items-center gap-1 hover:shadow-sm transition-all">
                                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                                            Download Material
                                                                                        </a>
                                                                                        <button
                                                                                            onClick={() => startTopicQuiz(course.id, module.id, topic, pdfId)}
                                                                                            className="text-xs font-bold text-black border border-black/10 bg-black/5 px-2 py-1 rounded-lg flex items-center gap-1 hover:shadow-sm transition-all hover:bg-black/10"
                                                                                        >
                                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                                            Take Quiz
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => startExercise(course.id, module.id, topic, pdfId)}
                                                                                            className="text-xs font-bold text-black border border-black/10 bg-black/5 px-2 py-1 rounded-lg flex items-center gap-1 hover:shadow-sm transition-all hover:bg-black/10"
                                                                                        >
                                                                                            <SparklesIcon className="w-4 h-4" />
                                                                                            Take Exercise</button>
                                                                                        <button onClick={() => setVisualAI({ materialId: pdfId!, topic, courseId: course.id, moduleId: module.id })} className="text-[10px] font-black uppercase tracking-widest text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5"><VideoIcon className="w-4 h-4" />Generate Video</button>
                                                                                    </>
                                                                                ) : (
                                                                                    <span className="text-xs text-gray-400 italic">
                                                                                        No material uploaded yet
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest leading-none">Topic {tidx + 1}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="pt-4 border-t border-gray-100 italic text-gray-400 text-xs text-center">
                                                        Weekly course content is updated regularly by the research team.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white border border-dashed border-gray-200 rounded-3xl">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                            <PlusIcon className="w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-bold text-black mb-2">Build Your Knowledge Base</h3>
                        <p className="text-gray-500 max-w-sm mx-auto">You haven't enrolled in any courses yet. Explore our architected catalog below to get started!</p>
                    </div >
                )}

                <div className="pt-12 border-t border-gray-200">
                    <h2 className="text-3xl font-black text-black mb-8 tracking-tight">Expand Your Horizons</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {courses.filter(c => !enrolledCourseIds.includes(c.id)).slice(0, 6).map(course => (
                            <div key={course.id} className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-black hover:shadow-2xl hover:shadow-black/5 transition-all duration-300">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-xl leading-snug group-hover:text-black transition-colors">{course.title}</h3>
                                    <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 bg-black/5 text-black border border-black/10 rounded-lg">Featured</span>
                                </div>
                                <p className="text-sm text-gray-500 mb-6 line-clamp-3 leading-relaxed">
                                    {course.description || `Embark on a guided journey through ${course.modules.length} weeks of architected learning curriculum.`}
                                </p>
                                <Button className="w-full py-4 rounded-xl shadow-lg shadow-black/10" onClick={() => onEnrollCourse(course.id)}>
                                    Join Course
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </div >
        );
    };

    const renderStudentVideos = () => {
        const myCourses = courses.filter(c => enrolledCourseIds.includes(c.id));

        const doUploadIfAny = async () => {
            if (!customFile || !selCourse || !selModule) return;
            setIsUp(true);
            try {
                await uploadMaterial({ courseId: selCourse.id, moduleId: selModule.id, file: customFile });
                setCustomFile(null);
            } catch (e) {
                console.error(e);
            } finally {
                setIsUp(false);
            }
        };

        return (
            <div className="space-y-8 animate-fade-in">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold text-black tracking-tight">AI Study Videos</h2>
                </div>
                {myCourses.length === 0 ? (
                    <div className="text-center py-16 bg-card border border-dashed border-border rounded-lg">
                        <h3 className="text-xl font-semibold mb-2">No courses enrolled</h3>
                        <p className="text-muted-foreground">Enroll in a course first from the Courses catalog.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 bg-card border border-border rounded-lg p-4 space-y-3">
                            <h3 className="font-semibold text-black">Generate a new video</h3>
                            <label className="block text-sm">Course</label>
                            <select className="w-full p-2 bg-background border border-border rounded-md text-black" value={selCourseId || selCourse?.id || ''} onChange={(e) => { setSelCourseId(e.target.value); setSelModuleId(''); }}>
                                <option value="">Select a course...</option>
                                {myCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                            {selCourse && (
                                <>
                                    <label className="block text-sm">Module</label>
                                    <select className="w-full p-2 bg-background border border-border rounded-md text-black" value={selModuleId || selModule?.id || ''} onChange={(e) => setSelModuleId(e.target.value)}>
                                        <option value="">Select a module...</option>
                                        {selCourse.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                    </select>
                                </>
                            )}

                            {selModule && (
                                <div className="mt-3">
                                    <p className="text-sm font-medium mb-2 text-black">Teacher topics</p>
                                    {(selModule.topics || []).length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {(selModule.topics || []).map(t => (
                                                <Button key={t} size="sm" onClick={() => onGenerateLectureClick(selCourse!, selModule!, t)}>Generate: {t}</Button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No topics yet for this module.</p>
                                    )}
                                </div>
                            )}

                            <div className="mt-4">
                                <p className="text-sm font-medium mb-2 text-black">Or upload your PDF and enter a topic</p>
                                <input type="file" accept="application/pdf" className="text-xs" onChange={(e) => setCustomFile(e.target.files?.[0] || null)} />
                                <input type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g., Sorting Algorithms" className="mt-2 w-full p-2 bg-background border border-border rounded-md text-black" />
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="secondary" onClick={doUploadIfAny} disabled={!customFile || isUp}>{isUp ? 'Uploading...' : 'Upload PDF'}</Button>
                                    <Button size="sm" onClick={() => selCourse && selModule && onGenerateLectureClick(selCourse, selModule, customTopic)} disabled={!customTopic || !selCourse || !selModule}>Generate</Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Uploading links the material to your selected course/module for better retrieval.</p>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            {allVideos.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                                    {allVideos.map(({ v, course, module }) => (
                                        <div key={v.id} className="bg-card border border-border rounded-lg p-4 flex flex-col">
                                            <div className="flex-1">
                                                <h3 className="font-semibold mb-1 text-black">{v.title}</h3>
                                                <p className="text-xs text-muted-foreground mb-2">{course.title} • {module.title}</p>
                                                <p className="text-sm text-muted-foreground line-clamp-3">{v.summary}</p>
                                            </div>
                                            <div className="mt-3">
                                                <Button size="sm" onClick={() => onSelectLecture(v)}>Watch</Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-16 bg-card border border-dashed border-border rounded-lg">
                                    <h3 className="text-xl font-semibold mb-2">No videos yet</h3>
                                    <p className="text-muted-foreground mb-4">Select an enrolled course, pick a topic or upload a PDF, then generate your first video.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderCatalog = () => (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-black rounded-3xl p-10 text-white relative overflow-hidden">
                <div className="relative z-10 max-w-2xl">
                    <h2 className="text-4xl font-black mb-4 tracking-tight">University Course Catalog</h2>
                    <p className="text-gray-400 text-lg mb-8 uppercase tracking-widest font-bold">Discover Architected Knowledge</p>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by subject, researcher, or keyword..."
                            className="w-full p-5 pl-12 bg-white/10 border border-white/20 rounded-2xl text-white placeholder:text-gray-500 focus:bg-white focus:text-black outline-none transition-all shadow-2xl"
                            value={catalogQuery}
                            onChange={e => setCatalogQuery(e.target.value)}
                        />
                        <svg className="w-6 h-6 absolute left-4 top-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>
                <div className="absolute right-[-10%] top-[-20%] w-[50%] h-[150%] bg-white/5 blur-[120px] rounded-full rotate-45" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {courses.filter(c =>
                    c.title.toLowerCase().includes(catalogQuery.toLowerCase()) ||
                    c.description.toLowerCase().includes(catalogQuery.toLowerCase())
                ).map(course => (
                    <div key={course.id} className="group bg-white border border-gray-200 rounded-3xl p-8 hover:border-black hover:shadow-2xl transition-all duration-500 flex flex-col">
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-black/5 transition-colors">
                                    <SparklesIcon className="w-8 h-8 text-gray-400 group-hover:text-black" />
                                </div>
                                {enrolledCourseIds.includes(course.id) && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-black bg-black/5 px-2 py-1 rounded-lg">Owned</span>
                                )}
                            </div>
                            <h3 className="text-2xl font-black text-black mb-3 group-hover:text-black transition-colors leading-tight">{course.title}</h3>
                            <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed mb-8">{course.description || "A comprehensive curriculum architected for mastery."}</p>
                            <div className="flex items-center gap-6 text-xs font-bold text-gray-400 uppercase tracking-widest">
                                <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-gray-300" />{course.modules.length} Weeks</span>
                                <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-gray-300" />Self-Paced</span>
                            </div>
                        </div>
                        <div className="mt-8 pt-8 border-t border-gray-100">
                            {enrolledCourseIds.includes(course.id) ? (
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1 py-4 font-bold border-2" onClick={() => onWithdrawCourse?.(course.id)}>Withdraw</Button>
                                    <div className="flex-1 flex items-center justify-center font-black text-xs text-black uppercase tracking-widest">In Library</div>
                                </div>
                            ) : (
                                <Button className="w-full py-4 font-bold shadow-xl shadow-black/10 group-hover:shadow-black/20" onClick={() => onEnrollCourse(course.id)}>Enroll in Course</Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-screen">
                {currentView === 'teacher_dashboard' && user.role === Role.Teacher && renderTeacherOverview()}
                {currentView === 'teacher_course_mgmt' && user.role === Role.Teacher && renderTeacherCourseMgmt()}
                {currentView === 'student_dashboard' && user.role === Role.Student && renderStudentMyCourses()}
                {currentView === 'student_catalog' && user.role === Role.Student && renderCatalog()}
                {currentView === 'student_videos' && user.role === Role.Student && renderStudentVideos()}
            </div>

            {/* Fullscreen Quiz Overlay */}
            {activeQuiz && activeQuiz.isFullscreen && (
                <div className="fixed inset-0 bg-black/95 z-50 overflow-y-auto">
                    <div className="min-h-screen flex items-center justify-center p-4">
                        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-8">
                            {activeQuiz.error ? (
                                <div className="text-center">
                                    <p className="text-lg text-black font-bold mb-6">{activeQuiz.error}</p>
                                    <Button onClick={async () => {
                                        if (document.fullscreenElement) {
                                            try { await document.exitFullscreen(); } catch (err) { }
                                        }
                                        setActiveQuiz(null);
                                    }}>Close</Button>
                                </div>
                            ) : (
                                <>
                                    {/* Quiz Header */}
                                    <div className="flex justify-between items-center mb-8 pb-6 border-b-2 border-gray-200">
                                        <div>
                                            <h2 className="text-3xl font-black text-black">{activeQuiz.topic || 'Quiz'}</h2>
                                            <p className="text-gray-500 mt-1">Answer all questions to the best of your ability</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Time Remaining</p>
                                            <p className="text-3xl font-black text-black font-mono">
                                                {String(Math.floor((activeQuiz.left || 0) / 60)).padStart(2, '0')}:{String((activeQuiz.left || 0) % 60).padStart(2, '0')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Questions or Results */}
                                    {activeQuiz.result ? (
                                        <div className="space-y-8">
                                            <div className="text-center p-8 bg-black/5 rounded-3xl border-2 border-black/10 shadow-inner">
                                                <h3 className="text-4xl font-black text-black mb-2">Quiz Complete!</h3>
                                                <div className="flex items-center justify-center gap-8 mt-4">
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Final Score</p>
                                                        <p className="text-4xl font-black text-black">{activeQuiz.result.score} / {activeQuiz.result.maxScore || activeQuiz.result.total}</p>
                                                    </div>
                                                    <div className="w-px h-12 bg-gray-200" />
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Percentage</p>
                                                        <p className="text-4xl font-black text-black">
                                                            {Math.round((activeQuiz.result.score / (activeQuiz.result.maxScore || activeQuiz.result.total)) * 100)}%
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                                                <h4 className="text-2xl font-black text-black border-b-4 border-gray-100 pb-3">Detailed Solutions</h4>
                                                {activeQuiz.questions.map((q, i) => {
                                                    const res = activeQuiz.result.results?.find((r: any) => r.questionIndex === i);
                                                    const userAnswer = activeQuiz.answers[i];
                                                    const isCorrect = res?.isCorrect || (q.type === 'mcq' && q.options[userAnswer as number] === q.correctAnswer);

                                                    return (
                                                        <div key={i} className={`p-8 rounded-3xl border-2 transition-all ${isCorrect ? 'border-gray-200 bg-gray-50/50' : 'border-black bg-black/5'}`}>
                                                            <div className="flex justify-between items-start mb-6">
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${isCorrect ? 'bg-black' : 'bg-gray-400'}`}>
                                                                        {i + 1}
                                                                    </span>
                                                                    <h5 className="font-bold text-black text-lg">Question {i + 1}</h5>
                                                                </div>
                                                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${isCorrect ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}>
                                                                    {isCorrect ? 'Mastered' : 'Needs Review'}
                                                                </span>
                                                            </div>

                                                            <p className="text-black mb-6 font-bold text-lg leading-relaxed">{q.question}</p>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                                <div className={`p-4 rounded-2xl border ${isCorrect ? 'bg-white/80 border-gray-100' : 'bg-white/80 border-black/10'}`}>
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Your Submission</p>
                                                                    <p className={`font-bold ${isCorrect ? 'text-black' : 'text-gray-700'}`}>
                                                                        {q.type === 'mcq' || !q.type
                                                                            ? (typeof userAnswer === 'number' ? q.options[userAnswer] : 'No answer selected')
                                                                            : (userAnswer || 'No response provided')}
                                                                    </p>
                                                                </div>
                                                                {!isCorrect && (
                                                                    <div className="p-4 rounded-2xl border bg-black text-white border-black shadow-sm">
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Correct Solution</p>
                                                                        <p className="text-white font-black">{q.correctAnswer}</p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {q.explanation && (
                                                                <div className="p-5 bg-white/40 rounded-2xl border border-gray-100">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Professor's Explanation</p>
                                                                    <p className="text-sm text-gray-600 leading-relaxed italic">"{q.explanation}"</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-8 max-h-[60vh] overflow-y-auto pr-4 mb-8">
                                            {activeQuiz.questions.map((q, i) => (
                                                <div key={i} className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <p className="text-lg font-bold text-black flex-1 leading-relaxed">
                                                            {i + 1}. {q.question}
                                                        </p>
                                                        <div className="flex gap-2 ml-4">
                                                            {q.difficulty && (
                                                                <span className="text-xs px-3 py-1 rounded-full font-bold uppercase whitespace-nowrap bg-black/5 text-black border border-black/10">
                                                                    {q.difficulty}
                                                                </span>
                                                            )}
                                                            {q.points && (
                                                                <span className="text-xs px-3 py-1 rounded-full font-bold bg-black text-white whitespace-nowrap">
                                                                    {q.points} pts
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {q.type === 'mcq' || !q.type ? (
                                                          
                                                    // Multiple Choice
                                                            q.options.map((opt, oi) => (
                                                                <label key={oi} className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${activeQuiz.answers[i] === oi
                                                                    ? 'border-black bg-black text-white shadow-md'
                                                                    : 'border-gray-200 hover:border-black/30 hover:bg-gray-100'
                                                                    }`}>
                                                                    <input
                                                                        type="radio"
                                                                        name={`q${i}`}
                                                                        checked={activeQuiz.answers[i] === oi}
                                                                        onChange={() => setAnswer(i, oi)}
                                                                        className="w-5 h-5 text-black focus:ring-black border-gray-300"
                                                                    />
                                                                    <span className={`text-base ${activeQuiz.answers[i] === oi ? 'font-bold' : 'text-gray-700'}`}>
                                                                        {opt}
                                                                    </span>
                                                                </label>
                                                            ))
                                                        ) : q.type === 'short' ? (
                                                           
                                                    // Short Answer
                                                            <input
                                                                type="text"
                                                                value={typeof activeQuiz.answers[i] === 'string' ? activeQuiz.answers[i] : ''}
                                                                onChange={(e) => setAnswer(i, e.target.value)}
                                                                placeholder="Type your answer here..."
                                                                className="w-full p-4 border-2 border-gray-300 rounded-xl focus:border-black focus:outline-none text-base text-black"
                                                            />
                                                        ) : q.type === 'programming' ? (
                                                            
                                                    // Programming Question
                                                            <textarea
                                                                value={typeof activeQuiz.answers[i] === 'string' ? activeQuiz.answers[i] : ''}
                                                                onChange={(e) => setAnswer(i, e.target.value)}
                                                                placeholder="Write your code or solution here..."
                                                                rows={8}
                                                                className="w-full p-4 border-2 border-gray-300 rounded-xl focus:border-black focus:outline-none text-base font-mono bg-black text-gray-200"
                                                            />
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Submit or Finish Buttons */}
                                    <div className="flex gap-4 pt-6 border-t-2 border-gray-200">
                                        {activeQuiz.result ? (
                                            <Button
                                                onClick={async () => {
                                                    if (document.fullscreenElement) {
                                                        try { await document.exitFullscreen(); } catch (err) { }
                                                    }
                                                    setActiveQuiz(null);
                                                }}
                                                className="flex-1 py-6 text-lg font-bold shadow-xl shadow-black/10"
                                            >
                                                Return to Laboratory
                                            </Button>
                                        ) : (
                                            <>
                                                <Button
                                                    onClick={submitActiveQuiz}
                                                    disabled={activeQuiz.submitting}
                                                    className="flex-1 py-6 text-lg font-bold shadow-xl shadow-black/10"
                                                >
                                                    {activeQuiz.submitting ? 'Authenticating Submission...' : 'Submit Assessment'}
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    onClick={async () => {
                                                        if (document.fullscreenElement) {
                                                            try { await document.exitFullscreen(); } catch (err) { }
                                                        }
                                                        setActiveQuiz(null);
                                                    }}
                                                    disabled={activeQuiz.submitting}
                                                    className="px-8 py-6 text-lg font-bold border-2"
                                                >
                                                    Cancel
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Fullscreen Exercise Overlay */}
            {activeExercise && (
                <div className="fixed inset-0 bg-black/95 z-50 overflow-y-auto">
                    <div className="min-h-screen flex items-center justify-center p-6">
                        <div className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                            {activeExercise.isLoading ? (
                                <div className="p-20 text-center">
                                    <Loader text="Generating..." />
                                    <h2 className="text-2xl font-black text-black mt-8 mb-2">Architecting Your Mini-Project</h2>
                                    <p className="text-gray-500 max-w-md mx-auto">Our AI is analyzing the lecture content to design a high-impact exercise that will supercharge your CV.</p>
                                </div>
                            ) : activeExercise.error ? (
                                <div className="p-20 text-center">
                                    <div className="w-20 h-20 bg-gray-50 text-black rounded-full flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h2 className="text-2xl font-black text-black mb-2">Research Interrupted</h2>
                                    <p className="text-black mb-8 font-medium">{activeExercise.error}</p>
                                    <Button onClick={() => setActiveExercise(null)}>Return to Dashboard</Button>
                                </div>
                            ) : (
                                <div className="flex flex-col md:flex-row h-full">
                                    
                                    {/* Left Section: Exercise Info */}
                                    <div className="flex-1 p-10 md:p-12 space-y-8 bg-white overflow-y-auto custom-scrollbar">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black">Industry-Standard Mini-Project</span>
                                                <h2 className="text-4xl font-black text-black tracking-tight leading-tight">{activeExercise.title}</h2>
                                            </div>
                                            <div className="p-4 bg-black/5 rounded-2xl text-black">
                                                <SparklesIcon className="w-8 h-8" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <div className="w-1 h-1 bg-gray-400 rounded-full" /> Mission Objective
                                            </h3>
                                            <p className="text-lg text-gray-600 leading-relaxed font-medium">{activeExercise.description}</p>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1 h-1 bg-gray-400 rounded-full" /> Technical Requirements
                                                </h3>
                                                <ul className="space-y-3">
                                                    {activeExercise.requirements.map((req, i) => (
                                                        <li key={i} className="flex gap-4 group">
                                                            <div className="mt-1.5 w-5 h-5 rounded-md border-2 border-gray-100 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400 group-hover:border-black group-hover:text-black transition-all">{i + 1}</div>
                                                            <span className="text-gray-600 text-sm font-semibold">{req}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1 h-1 bg-gray-400 rounded-full" /> Mastery Goals
                                                </h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {activeExercise.learningObjectives.map((obj, i) => (
                                                        <span key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold text-gray-500 flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-black rounded-full" /> {obj}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-8 bg-black rounded-3xl text-white relative overflow-hidden group shadow-2xl shadow-black/20">
                                            <div className="relative z-10 space-y-3">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <SparklesIcon className="w-4 h-4" /> Career Catalyst Tips
                                                </h4>
                                                <p className="text-sm font-medium leading-relaxed italic text-gray-100">"{activeExercise.portfolioTip}"</p>
                                            </div>
                                            <div className="absolute right-[-10%] bottom-[-20%] w-40 h-40 bg-white/10 blur-3xl rounded-full" />
                                        </div>
                                    </div>

                                    {/* Right Section: Controls */}
                                    <div className="w-full md:w-80 bg-gray-50 border-l border-gray-100 p-10 flex flex-col justify-between">
                                        <div className="space-y-8">
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Collaboration</h4>
                                                <p className="text-xs text-gray-500 leading-relaxed">This exercise is architected for maximum growth. Need a different challenge?</p>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                className="w-full py-4 text-sm font-bold border-2"
                                                onClick={() => startExercise(activeExercise.courseId, activeExercise.moduleId, activeExercise.topic, activeExercise.materialId)}
                                            >
                                                Suggest Something Else
                                            </Button>
                                        </div>

                                        <div className="space-y-4 pt-10 border-t border-gray-200">
                                            <Button className="w-full py-6 text-base font-black shadow-2xl shadow-black/10 rounded-2xl" onClick={handleSaveExercise}>
                                                Save For Later
                                            </Button>
                                            <button
                                                onClick={async () => {
                                                    if (document.fullscreenElement) {
                                                        try { await document.exitFullscreen(); } catch (err) { }
                                                    }
                                                    setActiveExercise(null);
                                                }}
                                                className="w-full py-4 text-sm font-bold text-gray-400 hover:text-black transition-colors"
                                            >
                                                Close Research Panel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {visualAI && (
                <VisualAIPlayer
                    materialId={visualAI.materialId}
                    topic={visualAI.topic}
                    courseId={visualAI.courseId}
                    moduleId={visualAI.moduleId}
                    onClose={() => setVisualAI(null)}
                />
            )}
        </>
    );
};

export default Dashboard;


