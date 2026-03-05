import React, { useEffect, useState, useMemo } from 'react';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { SparklesIcon, CheckCircleIcon, XCircleIcon, ChevronRightIcon, DeleteIcon, VideoIcon } from '../Icons';
import { listSavedExercises, evaluateExercise, deleteExercise, Exercise } from '../../services/exerciseService';
import type { Course } from '../../types';

interface MyExercisesProps {
    courses: Course[];
}

const MyExercises: React.FC<MyExercisesProps> = ({ courses }) => {
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);
    const [solution, setSolution] = useState('');
    const [evaluating, setEvaluating] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchExercises();
    }, []);

    const fetchExercises = async () => {
        try {
            setLoading(true);
            const data = await listSavedExercises();
            setExercises(data);
        } catch (err) {
            console.error('Failed to fetch exercises:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this exercise?')) return;
        try {
            await deleteExercise(id);
            setExercises(prev => prev.filter(ex => ex._id !== id));
        } catch (err: any) {
            alert(err.message || 'Failed to delete exercise');
        }
    };

    const handleStartExercise = (ex: Exercise) => {
        setActiveExercise(ex);
        setSolution(ex.solution || '');
        setError('');

        // request fullscreen for focus
        try {
            document.documentElement.requestFullscreen().catch(() => { });
        } catch { }
    };

    const handleCloseExercise = () => {
        setActiveExercise(null);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        fetchExercises(); // Refresh list to show updated status/score
    };

    const handleEvaluate = async () => {
        if (!activeExercise?._id || !solution.trim()) return;

        try {
            setEvaluating(true);
            setError('');
            const result = await evaluateExercise(activeExercise._id, solution);
            setActiveExercise({
                ...activeExercise,
                feedback: result.feedback,
                status: 'graded' as any
            });
        } catch (err: any) {
            setError(err.message || 'Failed to evaluate solution');
        } finally {
            setEvaluating(false);
        }
    };

    // Grouping Logic
    const groupedExercises = useMemo(() => {
        const groups: Record<string, Record<string, Exercise[]>> = {};

        exercises.forEach(ex => {
            const course = courses.find(c => c.id === ex.courseId);
            const courseTitle = course?.title || 'General Exercises';
            const topic = ex.topic || 'General Topic';

            if (!groups[courseTitle]) groups[courseTitle] = {};
            if (!groups[courseTitle][topic]) groups[courseTitle][topic] = [];
            groups[courseTitle][topic].push(ex);
        });

        return groups;
    }, [exercises, courses]);

    if (loading) return <div className="p-20 flex justify-center"><Loader text="Loading your exercises..." /></div>;

    if (activeExercise) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col font-sans">
                {/* Header */}
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                            <SparklesIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900">{activeExercise.title}</h2>
                            <p className="text-xs text-slate-500">{activeExercise.topic || 'Industry-led Exercise'}</p>
                        </div>
                    </div>
                    <button onClick={handleCloseExercise} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <XCircleIcon className="w-8 h-8" />
                    </button>
                </header>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Details */}
                    <div className="w-1/3 border-r border-slate-200 bg-white overflow-y-auto p-8 custom-scrollbar">
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-2">The Mission</h3>
                                <p className="text-slate-700 leading-relaxed font-medium">{activeExercise.description}</p>
                            </div>

                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 mb-4">Core Requirements</h3>
                                <ul className="space-y-3">
                                    {activeExercise.requirements.map((req, i) => (
                                        <li key={i} className="flex gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <div className="w-5 h-5 rounded-full bg-white border border-slate-200 flex flex-shrink-0 items-center justify-center text-[10px] font-bold">{i + 1}</div>
                                            {req}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-2">Learning Objectives</h3>
                                <div className="flex flex-wrap gap-2">
                                    {activeExercise.learningObjectives.map((obj, i) => (
                                        <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-100">
                                            {obj}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-2">Career Catalyst Tip</h3>
                                <p className="text-sm text-slate-300 italic leading-relaxed">"{activeExercise.portfolioTip}"</p>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Solution Input & Feedback */}
                    <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
                        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                            <div className="max-w-4xl mx-auto space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-sm font-bold text-slate-700">Your Implementation / Solution</label>
                                        <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 uppercase">Input restricted: No Copy-Paste</span>
                                    </div>
                                    <div className="relative group">
                                        <textarea
                                            value={solution}
                                            onChange={(e) => setSolution(e.target.value)}
                                            onPaste={(e) => {
                                                e.preventDefault();
                                                alert('Copy-pasting is disabled for exercises. Please implement your solution manually to maximize learning impact.');
                                            }}
                                            placeholder="Document your thought process, share your code, or paste your analytical results here..."
                                            className="w-full h-[400px] p-6 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-0 outline-none font-mono text-sm leading-relaxed shadow-inner bg-white transition-all"
                                        />
                                        <div className="absolute top-4 right-4 text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-400">MARKDOWN SUPPORTED</div>
                                    </div>
                                </div>

                                {activeExercise.feedback && (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="bg-indigo-600 text-white rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-10"><SparklesIcon className="w-24 h-24" /></div>
                                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                                <CheckCircleIcon className="w-6 h-6" />
                                                AI Mentor Evaluation
                                            </h3>
                                            <div className="prose prose-invert max-w-none text-sm leading-relaxed opacity-90 whitespace-pre-wrap">
                                                {activeExercise.feedback}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2">
                                        <XCircleIcon className="w-5 h-5" />
                                        {error}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-white border-t border-slate-200 flex justify-center">
                            <Button
                                className="px-12 py-4 text-lg font-black shadow-xl shadow-indigo-500/20 rounded-2xl flex items-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleEvaluate}
                                disabled={evaluating || !solution.trim()}
                            >
                                {evaluating ? <><Loader /> Evaluating...</> : <><SparklesIcon className="w-6 h-6" /> Submit for Peerless AI Review</>}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10">
            <header className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
                        <SparklesIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">My Professional Lab</h1>
                </div>
                <p className="text-slate-500 text-lg font-medium ml-1">Refining concepts through hands-on industry challenges.</p>
            </header>

            {exercises.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] p-20 flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                        <SparklesIcon className="w-12 h-12" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">No Exercises Saved Yet</h2>
                        <p className="text-slate-500 max-w-xs mx-auto">Complete a lecture and click "Take Exercise" to build your portfolio.</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-16">
                    {Object.entries(groupedExercises).map(([courseTitle, topics]) => (
                        <section key={courseTitle} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="pb-4 border-b-2 border-slate-100 flex items-center gap-4">
                                <div className="p-3 bg-slate-900 rounded-2xl text-white shadow-lg">
                                    <SparklesIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{courseTitle}</h2>
                                    <p className="text-sm font-bold text-slate-400">COURSE LABORATORY</p>
                                </div>
                            </div>

                            <div className="space-y-12 ml-4">
                                {Object.entries(topics).map(([topicTitle, exList]) => (
                                    <div key={topicTitle} className="space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                                            <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                                <VideoIcon className="w-5 h-5 opacity-50" />
                                                {topicTitle}
                                            </h3>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {exList.map((ex) => (
                                                <div
                                                    key={ex._id}
                                                    className="group bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all flex flex-col relative overflow-hidden"
                                                >
                                                    <div className="absolute top-0 right-0 p-4 flex gap-2">
                                                        {ex.status === 'graded' ? (
                                                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full border border-emerald-200">COMPLETED</span>
                                                        ) : (
                                                            <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded-full border border-amber-200">PENDING</span>
                                                        )}
                                                        <button
                                                            onClick={(e) => handleDelete(ex._id!, e)}
                                                            className="p-1.5 bg-red-50 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100"
                                                            title="Delete Exercise"
                                                        >
                                                            <DeleteIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="mb-6">
                                                        <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                                            <CheckCircleIcon className="w-6 h-6 opacity-30 group-hover:opacity-100" />
                                                        </div>
                                                        <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{ex.title}</h3>
                                                        <p className="text-sm text-slate-500 line-clamp-2 mt-2 leading-relaxed">
                                                            {ex.description}
                                                        </p>
                                                    </div>

                                                    <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requirements</span>
                                                            <span className="text-sm font-bold text-slate-700">{ex.requirements.length} Technical Tasks</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleStartExercise(ex)}
                                                            className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-indigo-600 hover:scale-110 transition-all shadow-lg"
                                                        >
                                                            <ChevronRightIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyExercises;
