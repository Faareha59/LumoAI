// App.tsx
import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import LectureViewer from './components/student/LectureViewer';
import Chatbot from './components/student/Chatbot';
import StudyTools from './components/student/StudyTools';
import CodingGame from './components/student/CodingGame';
import VideoGenerator from './components/teacher/VideoGenerator';
import PdfExplainer from './components/student/PdfExplainer';
import AdminConsole from './components/admin/AdminConsole';
import type { User, AppView, VideoDraft, Course, CourseModule } from './types';
import { LumoLogo } from './components/Icons';
import { fetchCourses, createCourse as apiCreateCourse, addLecture as apiAddLecture, deleteLecture as apiDeleteLecture, updateModuleTopics as apiUpdateModuleTopics } from './services/coursesService';
import { listMyEnrollments, enroll as apiEnroll, withdraw as apiWithdraw } from './services/enrollmentsService';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<AppView>('student_dashboard');
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedLecture, setSelectedLecture] = useState<VideoDraft | null>(null);
    const [generationContext, setGenerationContext] = useState<{course: Course, module: CourseModule, topic?: string} | null>(null);
    const [showSplash, setShowSplash] = useState(true);
    const [showAdminConsole, setShowAdminConsole] = useState(false);
    const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);

    // Local storage helpers for enrollment persistence per user
    const enrollKey = (uid: string) => `enrollments:${uid}`;
    const loadEnrollments = (uid: string): string[] => {
        try { const s = localStorage.getItem(enrollKey(uid)); return s ? JSON.parse(s) : []; } catch { return []; }
    };
    const saveEnrollments = (uid: string, ids: string[]) => {
        try { localStorage.setItem(enrollKey(uid), JSON.stringify(ids)); } catch {}
    };

    useEffect(() => {
        const t = setTimeout(() => setShowSplash(false), 2000);
        return () => clearTimeout(t);
    }, []);

    // Ensure courses are fetched whenever a user session exists
    useEffect(() => {
        (async () => {
            if (!user) return;
            try {
                const data = await fetchCourses();
                setCourses(data.courses || []);
            } catch {
                setCourses([]);
            }
        })();
    }, [user]);

    const refreshCourses = async () => {
        try {
            const data = await fetchCourses();
            setCourses(data.courses || []);
        } catch {
            setCourses([]);
        }
    };

    // Persist enrollments whenever they change for the logged-in student
    useEffect(() => {
        if (user?.role === 'student') {
            saveEnrollments(user.id, enrolledCourseIds);
        }
    }, [user?.id, user?.role, enrolledCourseIds]);

    const handleLogin = (loggedInUser: User) => {
        setUser(loggedInUser);
        if (loggedInUser.role === 'teacher') {
            setCurrentView('teacher_dashboard');
        } else {
            setCurrentView('student_dashboard');
        }
        // Hydrate enrollments for this user (server first, fallback to local)
        if (loggedInUser.role === 'student') {
            (async () => {
                try {
                    const e = await listMyEnrollments();
                    setEnrolledCourseIds(e.courseIds || []);
                } catch {
                    setEnrolledCourseIds(loadEnrollments(loggedInUser.id));
                }
            })();
        }
        // Load courses from server after login
        (async () => {
            try {
                const data = await fetchCourses();
                setCourses(data.courses || []);
            } catch {
                setCourses([]);
            }
        })();
    };

    const handleLogout = () => {
        setUser(null);
        setCourses([]); 
    };

    const handleSelectLecture = (lecture: VideoDraft) => {
        setSelectedLecture(lecture);
        setCurrentView('lecture_viewer');
    };
    
    const handleCreateCourse = async (subject: string, modules: CourseModule[]) => {
        try {
            const created = await apiCreateCourse(subject, modules);
            // Refresh courses from server to keep in sync
            const data = await fetchCourses();
            setCourses(data.courses || [created]);
        } catch (e) {
            // Fallback: optimistic local add
            const newCourse: Course = { id: `course-${Date.now()}`, title: subject, modules };
            setCourses(prev => [newCourse, ...prev]);
        }
    };
    
    const handleGenerateLectureClick = (course: Course, module: CourseModule, topic?: string) => {
        setGenerationContext({ course, module, topic });
        setCurrentView('video_generator');
    };

    const handlePublishVideo = async (video: VideoDraft, courseId: string, moduleId: string) => {
        try {
            await apiAddLecture(courseId, moduleId, video);
            const data = await fetchCourses();
            setCourses(data.courses || []);
        } catch {
            setCourses(prevCourses => prevCourses.map(course => (
                course.id === courseId
                    ? {
                        ...course,
                        modules: course.modules.map((m) =>
                            m.id === moduleId ? { ...m, lectures: [video, ...m.lectures] } : m
                        )
                    }
                    : course
            )));
        }
        if (user?.role === 'teacher') {
            setCurrentView('teacher_dashboard');
        } else {
            setCurrentView('student_dashboard');
        }
        setGenerationContext(null);
    };

    const handleDeleteLecture = async (courseId: string, moduleId: string, lectureId: string) => {
        try {
            await apiDeleteLecture(courseId, moduleId, lectureId);
            const data = await fetchCourses();
            setCourses(data.courses || []);
        } catch {
            setCourses(prevCourses => prevCourses.map(course => (
                course.id === courseId
                ? { ...course, modules: course.modules.map(m => m.id === moduleId ? { ...m, lectures: m.lectures.filter(l => l.id !== lectureId) } : m) }
                : course
            )));
        }
    };

    const handleEnrollCourse = async (courseId: string) => {
        try {
            await apiEnroll(courseId);
            setEnrolledCourseIds(prev => prev.includes(courseId) ? prev : [...prev, courseId]);
        } catch {
            setEnrolledCourseIds(prev => prev.includes(courseId) ? prev : [...prev, courseId]);
        }
    };

    const handleWithdrawCourse = async (courseId: string) => {
        try {
            await apiWithdraw(courseId);
            setEnrolledCourseIds(prev => prev.filter(id => id !== courseId));
        } catch {
            setEnrolledCourseIds(prev => prev.filter(id => id !== courseId));
        }
    };

    const handleUpdateModuleTopics = async (courseId: string, moduleId: string, topics: string[]) => {
        try {
            await apiUpdateModuleTopics(courseId, moduleId, topics);
            const data = await fetchCourses();
            setCourses(data.courses || []);
        } catch {
            // Local fallback
            setCourses(prev => prev.map(c => {
                if (c.id !== courseId) return c;
                return {
                    ...c,
                    modules: c.modules.map(m => m.id === moduleId ? { ...m, topics } : m)
                };
            }));
        }
    };

    const handleBackToDashboard = () => {
        setSelectedLecture(null);
        setGenerationContext(null);
        if (user?.role === 'teacher') {
            setCurrentView('teacher_dashboard');
        } else {
            setCurrentView('student_dashboard');
        }
    };
    
    const renderView = () => {
        if (!user) return null;

        if (currentView === 'lecture_viewer') {
            if (selectedLecture) {
                return <LectureViewer lecture={selectedLecture} onBack={handleBackToDashboard} />;
            }
            handleBackToDashboard();
            return null;
        }
        
        switch(currentView) {
            case 'student_dashboard':
            case 'student_courses':
            case 'student_videos':
            case 'teacher_dashboard':
            case 'teacher_course_mgmt':
                return <Dashboard 
                            user={user} 
                            courses={courses} 
                            currentView={currentView}
                            onSelectLecture={handleSelectLecture} 
                            onCreateCourse={handleCreateCourse}
                            onGenerateLectureClick={handleGenerateLectureClick}
                            onDeleteLecture={handleDeleteLecture}
                            enrolledCourseIds={enrolledCourseIds}
                            onEnrollCourse={handleEnrollCourse}
                            onWithdrawCourse={handleWithdrawCourse}
                            onUpdateModuleTopics={handleUpdateModuleTopics}
                            onRefreshCourses={refreshCourses}
                        />;
            case 'chatbot':
                return <Chatbot userName={user.name} />;
            case 'study_tools':
                return <StudyTools />;
            case 'coding_game':
                return <CodingGame />;
            case 'pdf_explainer':
                return <PdfExplainer />;
            case 'video_generator':
                if (generationContext) {
                    return <VideoGenerator 
                                course={generationContext.course}
                                module={generationContext.module}
                                topic={generationContext.topic}
                                onPublish={handlePublishVideo} 
                                onCancel={handleBackToDashboard}
                           />;
                }
                 handleBackToDashboard(); 
                 return null;
            default:
               
                handleBackToDashboard();
                return null;
        }
    };

    if (showSplash) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-4">
                    <LumoLogo className="w-16 h-16 text-foreground" />
                    <h1 className="text-3xl font-bold">LumoAI</h1>
                </div>
            </div>
        );
    }

    if (!user) {
        if (showAdminConsole) {
            return <AdminConsole onClose={() => setShowAdminConsole(false)} />;
        }
        return <Auth onLogin={handleLogin} onShowAdminConsole={() => setShowAdminConsole(true)} />;
    }

    return (
        <div className="flex h-screen bg-background text-foreground">
            <Sidebar user={user} currentView={currentView} setView={setCurrentView} onLogout={handleLogout} />
            <main className="flex-1 overflow-y-auto">
                {renderView()}
            </main>
        </div>
    );
};

export default App;
