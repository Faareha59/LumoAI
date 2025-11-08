import React, { useMemo, useState } from 'react';
import type { User, Course, CourseModule, VideoDraft, AppView } from '../types';
import { Role } from '../types';
import Button from './common/Button';
import { DeleteIcon, SparklesIcon, QuestionIcon } from './Icons';
import Loader from './common/Loader';
import { generateCourseModules } from '../services/geminiService';
import { uploadMaterial, listMaterials } from '../services/materialsService';

interface DashboardProps {
    user: User;
    courses: Course[];
    currentView?: AppView;
    onSelectLecture: (lecture: VideoDraft) => void;
    onCreateCourse: (subject: string, modules: CourseModule[]) => void;
    onGenerateLectureClick: (course: Course, module: CourseModule, topic?: string) => void;
    onDeleteLecture: (courseId: string, moduleId: string, lectureId: string) => void;
    enrolledCourseIds: string[];
    onEnrollCourse: (courseId: string) => void;
    onWithdrawCourse?: (courseId: string) => void;
    onUpdateModuleTopics: (courseId: string, moduleId: string, topics: string[]) => void;
    onRefreshCourses?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, courses, currentView, onSelectLecture, onCreateCourse, onGenerateLectureClick, onDeleteLecture, enrolledCourseIds, onEnrollCourse, onWithdrawCourse, onUpdateModuleTopics, onRefreshCourses }) => {
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [isCreatingCourse, setIsCreatingCourse] = useState(false);
    const [newCourseSubject, setNewCourseSubject] = useState('');
    const [isLoadingModules, setIsLoadingModules] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});
    const [uploading, setUploading] = useState<Record<string, boolean>>({});
    const [moduleFiles, setModuleFiles] = useState<Record<string, File | null>>({});
    const [materialsByModule, setMaterialsByModule] = useState<Record<string, Array<{ id: string; title: string; size: number; mime: string; indexed: boolean; createdAt: string }>>>({});
    const [draftCourse, setDraftCourse] = useState<{ subject: string; modules: CourseModule[] } | null>(null);
    const [catalogQuery, setCatalogQuery] = useState('');
    // Videos view state (must be top-level to satisfy Hooks rules)
    const myCourses = useMemo(() => courses.filter(c => enrolledCourseIds.includes(c.id)), [courses, enrolledCourseIds]);
    const [selCourseId, setSelCourseId] = useState<string>('');
    const [selModuleId, setSelModuleId] = useState<string>('');
    const [customTopic, setCustomTopic] = useState('');
    const [customFile, setCustomFile] = useState<File | null>(null);
    const [isUp, setIsUp] = useState(false);

    // Precompute all videos for the student_videos view (must not be inside a conditional to satisfy Hooks rules)
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

    const handleCreateCourse = async () => {
        if (!newCourseSubject.trim()) return;
        setIsLoadingModules(true);
        setError(null);
        try {
            const moduleOutlines = await generateCourseModules(newCourseSubject);
            const modules: CourseModule[] = moduleOutlines.map(outline => ({
                id: `module-${Date.now()}-${Math.random()}`,
                ...outline,
                lectures: []
            }));
            // Stage as a draft so teacher can explicitly upload/publish it
            setDraftCourse({ subject: newCourseSubject, modules });
            setIsCreatingCourse(false);
            setNewCourseSubject('');
        } catch (e) {
            const err = e as Error;
            setError(err.message || 'Failed to generate course modules.');
        } finally {
            setIsLoadingModules(false);
        }
    };

    const addTopic = (courseId: string, module: CourseModule) => {
        const value = (topicInputs[module.id] || '').trim();
        if (!value) return;
        const next = Array.from(new Set([...(module.topics || []), value]));
        onUpdateModuleTopics(courseId, module.id, next);
        setTopicInputs(prev => ({ ...prev, [module.id]: '' }));
    };

    const removeTopic = (courseId: string, module: CourseModule, topic: string) => {
        const next = (module.topics || []).filter(t => t !== topic);
        onUpdateModuleTopics(courseId, module.id, next);
    };

    const loadMaterials = async (courseId: string, moduleId: string) => {
        try {
            const res = await listMaterials(courseId, moduleId);
            setMaterialsByModule(prev => ({ ...prev, [moduleId]: res.materials }));
        } catch {}
    };

    const handleUpload = async (courseId: string, module: CourseModule) => {
        const file = moduleFiles[module.id];
        if (!file) return;
        setUploading(prev => ({ ...prev, [module.id]: true }));
        try {
            await uploadMaterial({ courseId, moduleId: module.id, file });
            setModuleFiles(prev => ({ ...prev, [module.id]: null }));
            await loadMaterials(courseId, module.id);
        } catch (e) {
            console.error(e);
        } finally {
            setUploading(prev => ({ ...prev, [module.id]: false }));
        }
    };

    const teacherCourses = useMemo(() => courses.filter(c => !c.creatorId || c.creatorId === user.id), [courses, user.id]);

    // Teacher Overview: count + names only
    const renderTeacherOverview = () => (
        <>
            <h2 className="text-3xl font-bold mb-4">Overview</h2>
            <div className="bg-card border border-border rounded-lg p-6 mb-6">
                <p className="text-lg">Total courses created: <span className="font-semibold">{teacherCourses.length}</span></p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">Your Courses</h3>
                {teacherCourses.length ? (
                    <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                        {teacherCourses.map(c => (
                            <li key={c.id}>{c.title}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">No courses created yet.</p>
                )}
            </div>
        </>
    );

    // Teacher Course Management: creation UI + search + full module management for teacher-owned courses
    const renderTeacherCourseMgmt = () => (
        <>
            {!isCreatingCourse && (
                <div className="bg-card border border-border rounded-lg p-6 mb-8">
                    <h2 className="text-2xl font-semibold mb-2">Manage Your Courses</h2>
                    <p className="text-muted-foreground mb-4">Create new subjects, let AI generate a curriculum, and then build video lectures for each module.</p>
                    <Button onClick={() => setIsCreatingCourse(true)}>
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        Create New Course
                    </Button>
                </div>
            )}
            {isCreatingCourse && (
                <div className="bg-card border border-border rounded-lg p-6 mb-8">
                    <h2 className="text-2xl font-semibold mb-2">Create a New Course</h2>
                    <p className="text-muted-foreground mb-4">Enter a subject, and LumoAI will generate a list of modules for your course syllabus.</p>
                    <div className="flex items-center gap-4">
                        <input
                            type="text"
                            value={newCourseSubject}
                            onChange={(e) => setNewCourseSubject(e.target.value)}
                            placeholder="e.g., 'Data Structures & Algorithms'"
                            className="w-full p-2 bg-background border border-border rounded-md"
                            disabled={isLoadingModules}
                        />
                        <Button onClick={handleCreateCourse} disabled={isLoadingModules || !newCourseSubject.trim()}>
                            {isLoadingModules ? 'Generating...' : 'Generate Modules'}
                        </Button>
                        <Button onClick={() => setIsCreatingCourse(false)} variant="secondary" disabled={isLoadingModules}>
                            Cancel
                        </Button>
                    </div>
                    {isLoadingModules && <Loader text="Generating course modules..." />}
                    {error && <p className="text-red-500 mt-2">{error}</p>}
                </div>
            )}

            {draftCourse && (
                <div className="bg-card border border-border rounded-lg p-6 mb-6">
                    <h3 className="text-xl font-semibold mb-2">Draft Course Ready</h3>
                    <p className="text-sm text-muted-foreground mb-4">Subject: <span className="font-medium">{draftCourse.subject}</span> • Modules: {draftCourse.modules.length}</p>
                    <div className="flex gap-2">
                        <Button onClick={() => { onCreateCourse(draftCourse.subject, draftCourse.modules); setDraftCourse(null); }}>Upload Course</Button>
                        <Button variant="secondary" onClick={() => setDraftCourse(null)}>Discard</Button>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-3xl font-bold">Your Courses</h2>
                <input
                    type="text"
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder="Search your courses..."
                    className="w-64 p-2 bg-background border border-border rounded-md"
                />
            </div>
            {teacherCourses.length > 0 ? (
                <div className="space-y-6">
                    {teacherCourses
                        .filter(c => (catalogQuery ? c.title.toLowerCase().includes(catalogQuery.toLowerCase()) : true))
                        .map(course => (
                        <div key={course.id} className="bg-card border border-border rounded-lg p-6">
                            <h3 className="text-2xl font-semibold mb-4">{course.title}</h3>
                            <div className="space-y-4">
                                {course.modules.map(module => (
                                    <div key={module.id} className="border-t border-border pt-4">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleModule(module.id)}>
                                            <div>
                                                <h4 className="text-lg font-semibold">{module.title}</h4>
                                                <p className="text-sm text-muted-foreground">{module.description}</p>
                                            </div>
                                            <span className={`transform transition-transform ${expandedModules[module.id] ? 'rotate-180' : ''}`}>▼</span>
                                        </div>
                                        {expandedModules[module.id] && (
                                            <div className="mt-4 pl-6 border-l-2 border-border ml-2 space-y-4">
                                                <div>
                                                    <p className="text-sm font-medium mb-2">Topics students can generate AI videos on:</p>
                                                    <div className="flex flex-wrap gap-2 mb-3">
                                                        {(module.topics || []).length > 0 ? (
                                                            (module.topics || []).map(topic => (
                                                                <span key={topic} className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-background border border-border text-sm">
                                                                    {topic}
                                                                    <button onClick={() => removeTopic(course.id, module, topic)} className="text-red-500">
                                                                        <DeleteIcon className="w-4 h-4" />
                                                                    </button>
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground italic">No topics added yet.</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={topicInputs[module.id] || ''}
                                                            onChange={(e) => setTopicInputs(prev => ({ ...prev, [module.id]: e.target.value }))}
                                                            placeholder="Add a topic (e.g., 'Binary Search Trees')"
                                                            className="flex-1 p-2 bg-background border border-border rounded-md"
                                                        />
                                                        <Button size="sm" onClick={() => addTopic(course.id, module)}>Add Topic</Button>
                                                    </div>
                                                </div>

                                                {module.lectures.length > 0 ? (
                                                    module.lectures.map(lecture => (
                                                        <div key={lecture.id} className="flex justify-between items-center p-2 rounded-md hover:bg-background">
                                                            <span>{lecture.title}</span>
                                                            <div className="flex items-center gap-2">
                                                                <Button variant="secondary" size="sm" onClick={() => onSelectLecture(lecture)}>View</Button>
                                                                <Button variant="danger" size="sm" onClick={() => onDeleteLecture(course.id, module.id, lecture.id)}><DeleteIcon className="w-4 h-4"/></Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : <p className="text-sm text-muted-foreground italic">No lectures for this module yet.</p>}

                                                <div className="pt-2">
                                                    <p className="text-sm font-medium mb-2">Module Materials (PDF, up to 5MB)</p>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="file"
                                                            accept="application/pdf"
                                                            onChange={(e) => setModuleFiles(prev => ({ ...prev, [module.id]: e.target.files?.[0] || null }))}
                                                        />
                                                        <Button size="sm" onClick={() => handleUpload(course.id, module)} disabled={uploading[module.id] || !moduleFiles[module.id]}>
                                                            {uploading[module.id] ? 'Uploading...' : 'Upload'}
                                                        </Button>
                                                        <Button size="sm" variant="secondary" onClick={() => loadMaterials(course.id, module.id)}>Refresh List</Button>
                                                    </div>
                                                    <div className="mt-2 space-y-1">
                                                        {(materialsByModule[module.id] || []).map(m => (
                                                            <div key={m.id} className="text-sm text-muted-foreground flex items-center justify-between">
                                                                <span>{m.title} • {Math.round(m.size/1024)} KB</span>
                                                                <span className={m.indexed ? 'text-green-500' : 'text-yellow-500'}>{m.indexed ? 'Indexed' : 'Processing'}</span>
                                                            </div>
                                                        ))}
                                                        {!(materialsByModule[module.id]?.length) && (
                                                            <p className="text-sm text-muted-foreground italic">No materials uploaded yet.</p>
                                                        )}
                                                    </div>
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
                <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
                    <p className="text-muted">You haven't created any courses yet.</p>
                </div>
            )}
        </>
    );

    const renderStudentVideos = () => {
        const selCourse = myCourses.find(c => c.id === selCourseId) || myCourses[0];
        const selModule = selCourse?.modules.find(m => m.id === selModuleId) || selCourse?.modules[0];

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
            <>
                <h2 className="text-3xl font-bold mb-6">Your Videos</h2>

                {myCourses.length === 0 ? (
                    <div className="text-center py-16 bg-card border border-dashed border-border rounded-lg">
                        <h3 className="text-xl font-semibold mb-2">No courses enrolled</h3>
                        <p className="text-muted-foreground">Enroll in a course first from the Courses catalog.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 bg-card border border-border rounded-lg p-4 space-y-3">
                            <h3 className="font-semibold">Generate a new video</h3>
                            <label className="block text-sm">Course</label>
                            <select className="w-full p-2 bg-background border border-border rounded-md" value={selCourseId || selCourse?.id || ''} onChange={(e) => { setSelCourseId(e.target.value); setSelModuleId(''); }}>
                                {myCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                            {selCourse && (
                                <>
                                <label className="block text-sm">Module</label>
                                <select className="w-full p-2 bg-background border border-border rounded-md" value={selModuleId || selModule?.id || ''} onChange={(e) => setSelModuleId(e.target.value)}>
                                    {selCourse.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                </select>
                                </>
                            )}

                            {selModule && (
                                <div className="mt-3">
                                    <p className="text-sm font-medium mb-2">Teacher topics</p>
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
                                <p className="text-sm font-medium mb-2">Or upload your PDF and enter a topic</p>
                                <input type="file" accept="application/pdf" onChange={(e) => setCustomFile(e.target.files?.[0] || null)} />
                                <input type="text" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g., Sorting Algorithms" className="mt-2 w-full p-2 bg-background border border-border rounded-md" />
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
                                                <h3 className="font-semibold mb-1">{v.title}</h3>
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
            </>
        );
    };

    // Student: My Courses (enrolled only, with full content)
    const renderStudentMyCourses = () => {
        const myCourses = courses.filter(c => enrolledCourseIds.includes(c.id));
        return (
            <>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold">My Courses</h2>
                </div>
                {myCourses.length > 0 ? (
                    <div className="space-y-6">
                        {myCourses.map(course => (
                            <div key={course.id} className="bg-card border border-border rounded-lg p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <h3 className="text-2xl font-semibold">{course.title}</h3>
                                    <span className="text-xs px-2 py-1 rounded bg-foreground text-background">Enrolled</span>
                                </div>
                                <div className="space-y-4">
                                    {course.modules.map(module => (
                                        <div key={module.id} className="border-t border-border pt-4">
                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleModule(module.id)}>
                                                <div>
                                                    <h4 className="text-lg font-semibold">{module.title}</h4>
                                                    <p className="text-sm text-muted-foreground">{module.description}</p>
                                                </div>
                                                <span className={`transform transition-transform ${expandedModules[module.id] ? 'rotate-180' : ''}`}>▼</span>
                                            </div>
                                            {expandedModules[module.id] && (
                                                <div className="mt-4 pl-6 border-l-2 border-border ml-2 space-y-3">
                                                    {module.lectures.length > 0 ? (
                                                        module.lectures.map(lecture => (
                                                            <div key={lecture.id} className="flex justify-between items-center p-2 rounded-md hover:bg-background">
                                                                <div>
                                                                    <p className="font-semibold">{lecture.title}</p>
                                                                    <p className="text-sm text-muted-foreground">{lecture.summary}</p>
                                                                </div>
                                                                <Button variant="primary" onClick={() => onSelectLecture(lecture)}>Start Lecture</Button>
                                                            </div>
                                                        ))
                                                    ) : <p className="text-sm text-muted-foreground italic">Lectures for this module are coming soon.</p>}

                                                    <div className="pt-2">
                                                        <p className="text-sm font-medium mb-2">Generate a new AI video by topic</p>
                                                        {(module.topics || []).length > 0 ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {(module.topics || []).map(topic => (
                                                                    <Button
                                                                        key={topic}
                                                                        size="sm"
                                                                        onClick={() => onGenerateLectureClick(course, module, topic)}
                                                                    >
                                                                        {`Generate: ${topic}`}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-sm text-muted-foreground italic">No topics available for generation.</p>
                                                        )}
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
                    <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
                        <p className="text-muted">You have not enrolled in any courses yet.</p>
                    </div>
                )}
            </>
        );
    };

    // Student: Catalog (browse and enroll), minimal info
    const renderStudentCoursesCatalog = () => {
        const q = catalogQuery.trim().toLowerCase();
        const visible = q
            ? courses.filter(c =>
                c.title.toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                c.modules.some(m => m.title.toLowerCase().includes(q)))
            : courses;
        return (
        <>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold">Courses Catalog</h2>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        placeholder="Search courses..."
                        className="w-56 p-2 bg-background border border-border rounded-md"
                    />
                    {onRefreshCourses && (
                        <Button size="sm" variant="secondary" onClick={onRefreshCourses}>Refresh</Button>
                    )}
                </div>
            </div>
            {visible.length > 0 ? (
                <div className="space-y-6">
                    {visible.map(course => (
                        <div key={course.id} className="bg-card border border-border rounded-lg p-6">
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="text-2xl font-semibold">{course.title}</h3>
                                {enrolledCourseIds.includes(course.id) ? (
                                    <Button size="sm" variant="secondary" onClick={() => onWithdrawCourse?.(course.id)}>Withdraw</Button>
                                ) : (
                                    <Button size="sm" onClick={() => onEnrollCourse(course.id)}>Enroll</Button>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">{course.description || `${course.modules.length} modules`}</p>
                            <p className="text-xs text-muted-foreground">{course.modules.length} modules{course.modules[0] ? ` • First: ${course.modules[0].title}` : ''}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-card border border-dashed border-border rounded-lg">
                    <p className="text-muted">No courses available yet. Check back soon!</p>
                </div>
            )}
        </>
        );
    };

    const isVideosView = currentView === 'student_videos' && user.role === Role.Student;
    const isCoursesView = currentView === 'student_courses' && user.role === Role.Student;

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-4xl font-bold mb-2">Welcome back, {user.name}!</h1>
            <p className="text-muted-foreground mb-8">
                {user.role === Role.Student 
                    ? (isVideosView ? 'Your personal video space' : isCoursesView ? 'Browse and enroll in courses' : "Ready for another study session? Let's dive in.")
                    : "Manage your courses and create new AI-powered lectures."}
            </p>

            {user.role === Role.Teacher
                ? (currentView === 'teacher_course_mgmt' ? renderTeacherCourseMgmt() : renderTeacherOverview())
                : isVideosView
                    ? renderStudentVideos()
                    : isCoursesView
                        ? renderStudentCoursesCatalog()
                        : renderStudentMyCourses()}
        </div>
    );
};

export default Dashboard;
