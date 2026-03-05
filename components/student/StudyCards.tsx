import React, { useState, useEffect } from 'react';
import { generateStudyCards } from '../../services/geminiService';
import type { Course } from '../../types';
import { SparklesIcon, BoltIcon, ChevronRightIcon, CardIcon, CheckCircleIcon } from '../Icons';

interface StudyCardsProps {
    courses: Course[];
    enrolledCourseIds: string[];
    focus?: string;
    onBack?: () => void;
}

interface Card {
    id: number;
    front: string;
    back: string;
    powerUp: string;
    category: string;
}

const StudyCards: React.FC<StudyCardsProps> = ({ courses, enrolledCourseIds, focus, onBack }) => {
    const [cards, setCards] = useState<Card[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [xp, setXp] = useState(0);
    const [viewedCount, setViewedCount] = useState(0);

    const activeCourse = courses.find(c => enrolledCourseIds.includes(c.id));
    const topics = activeCourse?.modules.flatMap(m => m.topics) || ['Computer Science', 'Modern Engineering'];

    // Load Cards on Mount
    useEffect(() => {
        const loadCards = async () => {
            setIsLoading(true);
            try {
                const generated = await generateStudyCards(topics, focus);
                setCards(generated);
            } catch (error) {
                console.error("Error loading cards:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadCards();
    }, [focus]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setIsFlipped(!isFlipped);
            } else if (e.code === 'Enter') {
                e.preventDefault();
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [isFlipped, currentIndex, cards.length]);

    const handleNext = () => {
        if (!isFlipped) {
            setIsFlipped(true);
            return;
        }

        if (currentIndex < cards.length - 1) {
            setIsFlipped(false);
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setViewedCount(prev => prev + 1);
                setXp(prev => prev + 25);
            }, 300);
        } else {
            // Finished current batch
            setViewedCount(prev => prev + 1);
            setXp(prev => prev + 100);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-black text-white space-y-8">
                <div className="relative">
                    <div className="w-24 h-24 border-4 border-white/20 border-t-white animate-spin rounded-full" />
                    <SparklesIcon className="w-10 h-10 text-white absolute inset-0 m-auto animate-pulse" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-black uppercase italic tracking-widest">Shuffling Deck</h2>
                    <p className="text-gray-400 font-mono text-xs uppercase mt-2">Generating subject-specific knowledge cards...</p>
                </div>
            </div>
        );
    }

    const currentCard = cards[currentIndex];

    if (!currentCard && !isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-black p-8 text-center">
                <p className="text-white/60 mb-6">Unable to load knowledge blocks for this subject.</p>
                <button
                    onClick={onBack}
                    className="px-8 py-3 bg-white/5 border border-white/10 text-white rounded-full hover:bg-white/10 transition-all font-black uppercase text-[10px] tracking-widest"
                >
                    Return to Hub
                </button>
            </div>
        );
    }

    if (viewedCount >= cards.length && cards.length > 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-black p-8">
                <div className="max-w-md w-full bg-gray-950 border border-white/10 rounded-[3.5rem] p-12 text-center space-y-10 shadow-[0_0_150px_rgba(255,255,255,0.05)] relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50" />

                    <div className="relative z-10">
                        <div className="w-28 h-28 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10 mb-8 animate-bounce">
                            <CheckCircleIcon className="w-14 h-14 text-white" />
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter leading-[0.8]">Simulation <br /><span className="text-gray-400">Mastered</span></h2>
                            <p className="text-gray-400 leading-relaxed font-medium text-sm px-4">Subject synchronization complete. Neural pathways for <span className="text-white font-bold">{activeCourse?.title}</span> have been reinforced.</p>
                        </div>
                    </div>

                    <div className="relative z-10 bg-white/5 rounded-[2rem] p-8 border border-white/5 backdrop-blur-md">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-2">Rewards Sequence</p>
                        <div className="flex items-center justify-center gap-3">
                            <BoltIcon className="w-6 h-6 text-white animate-pulse" />
                            <p className="text-4xl font-black text-white italic">+{xp} AP</p>
                        </div>
                        <p className="text-[8px] text-white/20 uppercase tracking-[0.2em] mt-3">Academic Points Deposited</p>
                    </div>

                    <div className="relative z-10 pt-4">
                        <button
                            onClick={onBack}
                            className="w-full py-6 bg-white text-black font-black rounded-[2rem] shadow-2xl hover:bg-gray-200 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-[0.15em] italic text-sm"
                        >
                            Return to Nexus
                        </button>
                    </div>

                    {/* Decorative bits */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 blur-[80px] rounded-full" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 blur-[80px] rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-black flex flex-col items-center p-8 overflow-y-auto custom-scrollbar">
            {/* HUD */}
            <div className="w-full max-w-5xl flex items-center justify-between mb-12">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                        <CardIcon className="w-6 h-6 text-black" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tight">Study Arena</h2>
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{activeCourse?.title}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Progress</p>
                        <p className="text-white font-black italic">{currentIndex + 1} / {cards.length}</p>
                    </div>
                    <div className="h-10 w-[1px] bg-white/10" />
                    <div className="text-right">
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Score</p>
                        <p className="text-white font-black italic">{xp} AP</p>
                    </div>
                </div>
            </div>

            {/* Stage */}
            <div className="flex-1 w-full flex flex-col items-center justify-center relative perspective-[2000px]">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 blur-[120px] rounded-full -z-10" />

                <div
                    className={`relative w-[450px] aspect-[4/5] cursor-pointer transition-all duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    {/* Front Side */}
                    <div className="absolute inset-0 backface-hidden bg-gray-950 border-2 border-white/10 rounded-[3rem] p-12 flex flex-col items-center justify-center text-center shadow-2xl overflow-hidden group">
                        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-white/5 to-transparent" />

                        <div className="relative z-10 w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-10 border border-white/10 group-hover:scale-110 transition-transform duration-500">
                            <SparklesIcon className="w-8 h-8 text-white" />
                        </div>

                        <div className="relative z-10 space-y-4">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-4 block">{currentCard.category}</span>
                            <h3 className="text-5xl font-black text-white uppercase italic leading-tight tracking-tighter">
                                {currentCard.front}
                            </h3>
                        </div>

                        <div className="absolute bottom-12 text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-2">
                            <span>Tap to reveal</span>
                            <ChevronRightIcon className="w-3 h-3 rotate-90" />
                        </div>

                        {/* Decorative corners */}
                        <div className="absolute top-8 left-8 w-4 h-4 border-t-2 border-l-2 border-white/10" />
                        <div className="absolute top-8 right-8 w-4 h-4 border-t-2 border-r-2 border-white/10" />
                        <div className="absolute bottom-8 left-8 w-4 h-4 border-b-2 border-l-2 border-white/10" />
                        <div className="absolute bottom-8 right-8 w-4 h-4 border-b-2 border-r-2 border-white/10" />
                    </div>

                    {/* Back Side */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gray-900/40 backdrop-blur-3xl border-2 border-white/20 rounded-[3rem] p-12 flex flex-col items-center justify-center text-center shadow-2xl overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        <div className="w-16 h-1 bg-white/20 rounded-full mb-10" />

                        <div className="space-y-8 flex-1 flex flex-col justify-center">
                            <p className="text-xl font-bold text-white leading-relaxed">
                                {currentCard.back}
                            </p>

                            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
                                <BoltIcon className="absolute -right-4 -top-4 w-16 h-16 text-white/5 rotate-12 group-hover:scale-110 transition-transform" />
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 text-left">Internal Intel</p>
                                <p className="text-xs text-gray-300 font-medium text-left leading-relaxed italic">
                                    "{currentCard.powerUp}"
                                </p>
                            </div>
                        </div>

                        <div className="pt-10 w-full">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                className="w-full py-5 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-white/5 active:scale-95"
                            >
                                <span className="uppercase tracking-widest italic">{currentIndex < cards.length - 1 ? 'Next Knowledge Block' : 'Master Simulation'}</span>
                                <ChevronRightIcon className="w-5 h-5 font-bold" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer hints */}
            <div className="mt-12 text-center space-y-2 opacity-50">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Neural Interface Optimized</p>
                <div className="flex gap-4 justify-center">
                    <span className="text-[8px] border border-white/10 px-2 py-1 rounded bg-white/5 uppercase font-bold text-white/30">Space to Flip</span>
                    <span className="text-[8px] border border-white/10 px-2 py-1 rounded bg-white/5 uppercase font-bold text-white/30">Enter for Next</span>
                </div>
            </div>

            <style>{`
                .perspective-2000 { perspective: 2000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
                @keyframes pulse-slow {
                    0%, 100% { opacity: 0.1; }
                    50% { opacity: 0.2; }
                }
            `}</style>
        </div>
    );
};

export default StudyCards;
