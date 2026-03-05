import React, { useState, useEffect, useRef } from 'react';
import Button from '../common/Button';
import { SparklesIcon, CubeIcon, BoltIcon, CheckCircleIcon, XCircleIcon } from '../Icons';
import { generateVoxelQuest } from '../../services/geminiService';
import type { Course } from '../../types';

interface Quest {
    id: number;
    blockType: string;
    questName: string;
    narrative: string;
    question: string;
    options: string[];
    correctAnswer: string;
    reward: string;
}

interface VoxelQuestProps {
    courses: Course[];
    enrolledCourseIds: string[];
    focus?: string;
    onBack?: () => void;
}

const VoxelQuest: React.FC<VoxelQuestProps> = ({ courses, enrolledCourseIds, focus, onBack }) => {
    const [quests, setQuests] = useState<Quest[]>([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<'mining' | 'answering' | 'result'>('mining');
    const [health, setHealth] = useState(10);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [xp, setXp] = useState(0);

    const mineSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'));
    const breakSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3'));
    const successSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'));

    useEffect(() => {
        const loadQuests = async () => {
            setLoading(true);
            try {
                const enrolled = courses.filter(c => enrolledCourseIds.includes(c.id));
                const topics = enrolled.length > 0 ? enrolled.map(c => c.title) : ['Algorithms', 'Data Structures'];
                const data = await generateVoxelQuest(topics, focus);
                setQuests(data);
            } catch (err) {
                console.error("Voxel load failed:", err);
            } finally {
                setLoading(false);
            }
        };
        loadQuests();
    }, [courses, enrolledCourseIds, focus]);

    const currentQuest = quests[currentIdx];

    const handleMine = () => {
        if (status !== 'mining') return;
        setHealth(prev => {
            const next = prev - 1;
            if (next <= 0) {
                breakSound.current.play().catch(() => { });
                setStatus('answering');
                return 0;
            }
            mineSound.current.currentTime = 0;
            mineSound.current.play().catch(() => { });
            return next;
        });
    };

    const handleAnswer = (opt: string) => {
        if (status !== 'answering') return;
        setSelectedOption(opt);
        if (opt === currentQuest.correctAnswer) {
            successSound.current.play().catch(() => { });
            setFeedback({ type: 'success', msg: `NICE! Gained ${currentQuest.reward}` });
            setXp(prev => prev + 50);
            setTimeout(() => {
                nextQuest();
            }, 2000);
        } else {
            setFeedback({ type: 'error', msg: "Ouch! Try again." });
            setTimeout(() => setFeedback(null), 1500);
        }
    };

    const nextQuest = () => {
        if (currentIdx < quests.length - 1) {
            setCurrentIdx(prev => prev + 1);
            setHealth(10);
            setStatus('mining');
            setFeedback(null);
            setSelectedOption(null);
        } else {
            setStatus('result');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-black text-gray-400 font-mono p-8">
                <div className="w-16 h-16 border-4 border-white border-t-transparent animate-spin rounded-xl mb-6 shadow-[0_0_20px_rgba(255,255,255,0.1)]"></div>
                <p className="animate-pulse tracking-[0.4em] uppercase text-sm">Generating Voxel World...</p>
            </div>
        );
    }

    if (status === 'result') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-black p-8 text-center bg-[radial-gradient(circle_at_center,_#1a1a1a_0%,_#000000_100%)]">
                <CubeIcon className="w-24 h-24 text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                <h2 className="text-5xl font-black text-white mb-2 uppercase italic tracking-tighter">Level Complete!</h2>
                <p className="text-gray-400 font-mono uppercase tracking-widest text-sm mb-8">You survived the logic caverns</p>
                <div className="bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl mb-8">
                    <p className="text-[10px] text-white/30 uppercase font-black mb-1">Experience Earned</p>
                    <p className="text-6xl font-black text-white">{xp} XP</p>
                </div>
                <Button onClick={onBack} className="bg-white hover:bg-gray-200 text-black px-12 py-5 rounded-3xl font-black uppercase tracking-widest text-sm transition-all shadow-xl">Return to Hub</Button>
            </div>
        );
    }

    if (!currentQuest && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-black p-8 text-center font-mono">
                <p className="text-gray-500 mb-6">Structural failure: No voxel blocks found.</p>
                <Button onClick={onBack}>Return to Hub</Button>
            </div>
        );
    }

    const getBlockColor = () => {
        switch (currentQuest?.blockType) {
            case 'Diamond': return 'from-gray-300 to-gray-500';
            case 'Gold': return 'from-gray-400 to-gray-600';
            case 'Redstone': return 'from-gray-500 to-gray-700';
            case 'Obsidian': return 'from-gray-800 to-black';
            default: return 'from-gray-600 to-gray-800';
        }
    };

    return (
        <div className="h-full bg-black overflow-hidden flex flex-col items-center justify-center p-8 select-none font-mono">
            {/* Game UI Overlay */}
            <div className="flex justify-between items-start w-full max-w-5xl mb-12">
                <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Quest {currentIdx + 1} / {quests.length}</p>
                    <h1 className="text-3xl font-black text-white uppercase italic">{currentQuest?.questName}</h1>
                </div>
                <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Global XP</p>
                        <p className="text-xl font-black text-white">{xp}</p>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* 3D Viewport */}
                <div className="flex flex-col items-center justify-center space-y-8">
                    <div className="perspective-[1000px] w-64 h-64 relative">
                        {status === 'mining' ? (
                            <div
                                onClick={handleMine}
                                className={`
                                    relative w-48 h-48 mx-auto transform-gpu transition-all duration-75 active:scale-90 active:rotate-3 cursor-crosshair
                                    hover:shadow-[0_0_50px_rgba(255,255,255,0.05)]
                                `}
                            >
                                {/* Pixel Cube representation - simpler for web without three.js */}
                                <div className={`w-full h-full bg-gradient-to-br ${getBlockColor()} rounded-xl border-4 border-white/20 relative overflow-hidden`}>
                                    {/* Crack Effect */}
                                    {health < 10 && (
                                        <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: `repeating-linear-gradient(${45 + (10 - health) * 10}deg, transparent, transparent 5px, rgba(0,0,0,0.8) 5px, rgba(0,0,0,0.8) 8px)` }} />
                                    )}
                                    <div className="absolute top-0 left-0 w-full h-1/2 bg-white/10" />
                                </div>
                                <div className="mt-8 text-center">
                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                                        <div
                                            className="h-full bg-white transition-all duration-200"
                                            style={{ width: `${(health / 10) * 100}%` }}
                                        />
                                    </div>
                                    <p className="mt-2 text-[10px] font-black text-white/40 uppercase tracking-widest">Stability: {health * 10}%</p>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-64 flex items-center justify-center animate-bounce">
                                <BoltIcon className="w-32 h-32 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
                            </div>
                        )}
                    </div>
                    <p className="text-gray-500 text-xs font-medium italic text-center max-w-xs uppercase tracking-widest leading-loose">
                        {status === 'mining' ? 'Click rapidly to mine the concept block' : 'The block is decoded! Extract the logic.'}
                    </p>
                </div>

                {/* Content Panel */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden backdrop-blur-sm">
                    {status === 'mining' ? (
                        <div className="space-y-6">
                            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/20">
                                <CubeIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white leading-relaxed">
                                {currentQuest?.narrative}
                            </h3>
                            <div className="py-4 border-y border-white/5">
                                <p className="text-[10px] text-white/30 uppercase font-black mb-2">Block Composition</p>
                                <div className="flex gap-2">
                                    <span className="px-3 py-1 bg-white/10 text-white text-[10px] font-bold rounded-full uppercase border border-white/20">{currentQuest?.blockType} Core</span>
                                    <span className="px-3 py-1 bg-gray-800 text-gray-400 text-[10px] font-bold rounded-full uppercase border border-white/10">Locked Reward: {currentQuest?.reward}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">// DECODED LOGIC QUESTION</p>
                                <h2 className="text-2xl font-bold text-white leading-tight">{currentQuest?.question}</h2>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {currentQuest?.options.map((opt, i) => (
                                    <button
                                        key={opt}
                                        onClick={() => handleAnswer(opt)}
                                        disabled={!!selectedOption}
                                        className={`
                                            group relative p-5 rounded-2xl text-left transition-all border font-bold text-sm
                                            ${selectedOption === opt
                                                ? (opt === currentQuest.correctAnswer ? 'bg-white border-white text-black' : 'bg-black border-gray-800 text-gray-400')
                                                : 'bg-white/5 border-white/10 text-white/60 hover:border-white hover:bg-white/10 hover:text-white'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className="w-8 h-8 rounded-lg bg-black/20 flex-shrink-0 flex items-center justify-center text-[10px]">{String.fromCharCode(65 + i)}</span>
                                            <span>{opt}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {feedback && (
                                <div className={`flex items-center gap-3 p-4 rounded-xl border animate-in slide-in-from-bottom-2 ${feedback.type === 'success' ? 'bg-white/10 border-white text-white' : 'bg-black border-gray-800 text-gray-400'}`}>
                                    {feedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5" /> : <XCircleIcon className="w-5 h-5" />}
                                    <span className="text-[10px] font-black uppercase tracking-widest">{feedback.msg}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Hotbar */}
            <div className="mt-auto flex items-center gap-2 bg-black/40 border border-white/10 p-2 rounded-2xl">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                    <div key={i} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border ${i === 1 ? 'bg-white/20 border-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-white/5 border-white/10 text-white/20'}`}>
                        {i === 1 && <CubeIcon className="w-6 h-6 text-white" />}
                        {i === 2 && <BoltIcon className="w-6 h-6 opacity-20" />}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VoxelQuest;
