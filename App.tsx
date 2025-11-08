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
import AdminConsole from './components/admin/AdminConsole';
import type { User, AppView, VideoDraft, Course, CourseModule } from './types';
import { LumoLogo } from './components/Icons';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState<AppView>('student_dashboard');
    const [courses, setCourses] = useState<Course[]>([]);
    const [selectedLecture, setSelectedLecture] = useState<VideoDraft | null>(null);
    const [generationContext, setGenerationContext] = useState<{course: Course, module: CourseModule} | null>(null);
    const [showSplash, setShowSplash] = useState(true);
    const [showAdminConsole, setShowAdminConsole] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setShowSplash(false), 2000);
        return () => clearTimeout(t);
    }, []);

    const handleLogin = (loggedInUser: User) => {
        setUser(loggedInUser);
        if (loggedInUser.role === 'teacher') {
            setCurrentView('teacher_dashboard');
        } else {
            setCurrentView('student_dashboard');
        }
    };

    const handleLogout = () => {
        setUser(null);
        setCourses([]); 
    };

    const handleSelectLecture = (lecture: VideoDraft) => {
        setSelectedLecture(lecture);
        setCurrentView('lecture_viewer');
    };
    
    const handleCreateCourse = (subject: string, modules: CourseModule[]) => {
        const newCourse: Course = {
            id: `course-${Date.now()}`,
            title: subject,
            modules: modules,
        };
        setCourses(prev => [newCourse, ...prev]);
    };
    
    const handleGenerateLectureClick = (course: Course, module: CourseModule) => {
        setGenerationContext({ course, module });
        setCurrentView('video_generator');
    };

    const handlePublishVideo = (video: VideoDraft, courseId: string, moduleId: string) => {
        setCourses(prevCourses => {
            return prevCourses.map(course => {
                if (course.id === courseId) {
                    const updatedModules = course.modules.map(module => {
                        if (module.id === moduleId) {
                           
                            return { ...module, lectures: [video, ...module.lectures] };
                        }
                        return module;
                    });
                    return { ...course, modules: updatedModules };
                }
                return course;
            });
        });
        setCurrentView('teacher_dashboard');
        setGenerationContext(null);
    };

    const handleDeleteLecture = (courseId: string, moduleId: string, lectureId: string) => {
        setCourses(prevCourses => {
            return prevCourses.map(course => {
                if (course.id === courseId) {
                    const updatedModules = course.modules.map(module => {
                        if (module.id === moduleId) {
                            const updatedLectures = module.lectures.filter(l => l.id !== lectureId);
                            return { ...module, lectures: updatedLectures };
                        }
                        return module;
                    });
                    return { ...course, modules: updatedModules };
                }
                return course;
            });
        });
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
            case 'teacher_dashboard':
                return <Dashboard 
                            user={user} 
                            courses={courses} 
                            onSelectLecture={handleSelectLecture} 
                            onCreateCourse={handleCreateCourse}
                            onGenerateLectureClick={handleGenerateLectureClick}
                            onDeleteLecture={handleDeleteLecture}
                        />;
            case 'chatbot':
                return <Chatbot userName={user.name} />;
            case 'study_tools':
                return <StudyTools />;
            case 'coding_game':
                return <CodingGame />;
            case 'video_generator':
                if (generationContext) {
                    return <VideoGenerator 
                                course={generationContext.course}
                                module={generationContext.module}
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
