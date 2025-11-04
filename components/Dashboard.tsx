import React, { useState } from 'react';
import type { User, Course, CourseModule, VideoDraft } from '../types';
import { Role } from '../types';
import Button from './common/Button';
import { DeleteIcon, SparklesIcon, QuestionIcon } from './Icons';
import Loader from './common/Loader';
import { generateCourseModules } from '../services/geminiService';

interface DashboardProps {
    user: User;
    courses: Course[];
    onSelectLecture: (lecture: VideoDraft) => void;
    onCreateCourse: (subject: string, modules: CourseModule[]) => void;
    onGenerateLectureClick: (course: Course, module: CourseModule) => void;
    onDeleteLecture: (courseId: string, moduleId: string, lectureId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, courses, onSelectLecture, onCreateCourse, onGenerateLectureClick, onDeleteLecture }) => {
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [isCreatingCourse, setIsCreatingCourse] = useState(false);
    const [newCourseSubject, setNewCourseSubject] = useState('');
    const [isLoadingModules, setIsLoadingModules] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            onCreateCourse(newCourseSubject, modules);
            // Reset form
            setIsCreatingCourse(false);
            setNewCourseSubject('');
        } catch (e) {
            const err = e as Error;
            setError(err.message || 'Failed to generate course modules.');
        } finally {
            setIsLoadingModules(false);
        }
    };

    const renderTeacherDashboard = () => (
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

            <h2 className="text-3xl font-bold mb-6">Your Courses</h2>
            {courses.length > 0 ? (
                <div className="space-y-6">
                    {courses.map(course => (
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
                                            <div className="mt-4 pl-6 border-l-2 border-border ml-2">
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
                                                <Button onClick={() => onGenerateLectureClick(course, module)} className="mt-4">Create Lecture for this Module</Button>
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

    const renderStudentDashboard = () => (
        <>
            <h2 className="text-3xl font-bold mb-6">Available Courses</h2>
            {courses.length > 0 ? (
                <div className="space-y-6">
                    {courses.map(course => (
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
                                             <div className="mt-4 pl-6 border-l-2 border-border ml-2">
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
                    <p className="text-muted">No courses available yet. Check back soon!</p>
                </div>
            )}
        </>
    );

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-4xl font-bold mb-2">Welcome back, {user.name}!</h1>
            <p className="text-muted-foreground mb-8">
                {user.role === Role.Student 
                    ? "Ready for another study session? Let's dive in." 
                    : "Manage your courses and create new AI-powered lectures."}
            </p>

            {user.role === Role.Teacher ? renderTeacherDashboard() : renderStudentDashboard()}
        </div>
    );
};

export default Dashboard;
