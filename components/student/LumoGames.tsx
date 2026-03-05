import React, { useState, useEffect } from 'react';
import { SparklesIcon, CodeBracketIcon, BoltIcon, CubeIcon, ChevronRightIcon, CardIcon, XIcon } from '../Icons';
import CodingGame from './CodingGame';
import VoxelQuest from './VoxelQuest';
import StudyCards from './StudyCards';
import GameBackground from './GameBackground';
import type { Course } from '../../types';

interface LumoGamesProps {
    courses: Course[];
    enrolledCourseIds: string[];
    onExit?: () => void;
}

type GameMode = 'select_subject' | 'select_game' | 'code_arena' | 'voxel_quest' | 'study_cards';

interface GameInfo {
    id: string;
    title: string;
    description: string;
    type: 'voxel_quest' | 'code_arena' | 'study_cards';
    focus: string;
    color: 'gray';
}

const LumoGames: React.FC<LumoGamesProps> = ({ courses, enrolledCourseIds, onExit }) => {
    const [mode, setMode] = useState<GameMode>('select_subject');
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [activeGame, setActiveGame] = useState<GameInfo | null>(null);

    const enrolledCourses = courses.filter(c => enrolledCourseIds.includes(c.id));

    useEffect(() => {
        if (enrolledCourses.length === 1 && !selectedCourseId) {
            setSelectedCourseId(enrolledCourses[0].id);
            setMode('select_game');
        } else if (enrolledCourses.length === 0) {
            setMode('select_game');
        }
    }, [enrolledCourses.length]);

    const handleCourseSelect = (id: string) => {
        setSelectedCourseId(id);
        setMode('select_game');
    };

    const selectedCourse = courses.find(c => c.id === selectedCourseId) || enrolledCourses[0];

    const getGamesForSubject = (courseTitle: string): GameInfo[] => {
        const title = courseTitle.toLowerCase();

        if (title.includes('machine learning') || title.includes('ml')) {
            return [
                {
                    id: 'ml_training',
                    title: 'Model Trainer',
                    description: 'Optimize hyperparameters and tune your neural networks for maximum accuracy.',
                    type: 'voxel_quest',
                    focus: 'Machine Learning Model training and hyperparameter optimization',
                    color: 'gray'
                },
                {
                    id: 'ml_bias',
                    title: 'Bias Breach',
                    description: 'Detect and eliminate algorithmic bias in prediction models to ensure fair results.',
                    type: 'code_arena',
                    focus: 'Algorithmic bias detection and fairness in Machine Learning',
                    color: 'gray'
                },
                {
                    id: 'ml_deep',
                    title: 'Neural Nexus',
                    description: 'Master advanced architectures like Transformers, RNNs, and CNNs.',
                    type: 'study_cards',
                    focus: 'Deep Learning architectures, Neural Networks, and Transformers',
                    color: 'gray'
                },
                {
                    id: 'ml_data',
                    title: 'Data Alchemist',
                    description: 'Clean, normalize, and transform raw data into high-quality training sets.',
                    type: 'code_arena',
                    focus: 'Data preprocessing, cleaning, and feature engineering for ML',
                    color: 'gray'
                }
            ];
        }

        if (title.includes('web') || title.includes('frontend') || title.includes('backend')) {
            return [
                {
                    id: 'web_container',
                    title: 'Flexbox Fortress',
                    description: 'Construct complex layouts by mastering HTML containers and CSS Flexbox/Grid.',
                    type: 'voxel_quest',
                    focus: 'HTML structure and CSS Flexbox/Grid containers',
                    color: 'gray'
                },
                {
                    id: 'web_style',
                    title: 'CSS Sorcerer',
                    description: 'Cast styling spells and create stunning visual effects with advanced CSS.',
                    type: 'code_arena',
                    focus: 'Advanced CSS properties, animations, and responsive design',
                    color: 'gray'
                },
                {
                    id: 'web_db',
                    title: 'Database Diver',
                    description: 'Connect your logic to persistent storage and master SQL/NoSQL integrations.',
                    type: 'code_arena',
                    focus: 'Backend database integration, SQL, and API development',
                    color: 'gray'
                },
                {
                    id: 'web_dom',
                    title: 'DOM Dominator',
                    description: 'Manipulate the live structure of any web page with high-speed JavaScript logic.',
                    type: 'study_cards',
                    focus: 'JavaScript DOM API, Event Handling, and Browser state',
                    color: 'gray'
                }
            ];
        }

        // Default generic games
        return [
            {
                id: 'gen_voxel',
                title: 'Concept Miner',
                description: `Mine conceptual logic blocks and build your understanding of ${courseTitle}.`,
                type: 'voxel_quest',
                focus: `Fundamental concepts of ${courseTitle}`,
                color: 'gray'
            },
            {
                id: 'gen_code',
                title: 'Decoder Arena',
                description: `Shatter firewalls by solving complex ${courseTitle} syntax puzzles.`,
                type: 'code_arena',
                focus: `Practical coding and syntax in ${courseTitle}`,
                color: 'gray'
            },
            {
                id: 'gen_cards',
                title: 'Recall Vault',
                description: `Train your memory with high-intensity flashcards for ${courseTitle}.`,
                type: 'study_cards',
                focus: `Key terms and definitions in ${courseTitle}`,
                color: 'gray'
            }
        ];
    };

    const subjectGames = getGamesForSubject(selectedCourse?.title || 'Applied Sciences');

    const handleLaunchGame = (game: GameInfo) => {
        setActiveGame(game);
        setMode(game.type);
    };

    const HubWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <div className="relative min-h-full overflow-hidden">
            <GameBackground />
            <div className="relative z-10 w-full h-full">
                {children}
            </div>
        </div>
    );

    const BackButton = () => (
        <button
            onClick={() => setMode('select_game')}
            className="absolute top-4 left-4 z-[100] p-3 bg-white border border-gray-200 hover:border-black text-gray-400 hover:text-black rounded-2xl transition-all flex items-center gap-2 pr-6 shadow-xl"
        >
            <ChevronRightIcon className="w-4 h-4 rotate-180" />
            <span className="text-[10px] font-black uppercase tracking-widest">Back to Hub</span>
        </button>
    );

    if (mode === 'select_subject') {
        return (
            <HubWrapper>
                <div className="min-h-full flex flex-col items-center justify-center p-8 space-y-12">
                    <button
                        onClick={onExit}
                        className="absolute top-8 left-8 p-3 bg-white border border-gray-200 hover:border-black text-gray-400 hover:text-black rounded-2xl transition-all flex items-center gap-2 pr-6 shadow-xl"
                    >
                        <ChevronRightIcon className="w-4 h-4 rotate-180" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Student Portal</span>
                    </button>

                    <div className="text-center space-y-4">
                        <div className="inline-flex p-4 bg-gray-50 rounded-3xl mb-4">
                            <SparklesIcon className="w-12 h-12 text-black animate-pulse" />
                        </div>
                        <h1 className="text-5xl font-black text-black tracking-tighter uppercase italic">Lumo Games Hub</h1>
                        <p className="text-gray-500 font-mono tracking-widest text-sm uppercase">Choose your academic training grounds</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                        {enrolledCourses.map(course => (
                            <button
                                key={course.id}
                                onClick={() => handleCourseSelect(course.id)}
                                className="group relative bg-white border border-gray-200 p-8 rounded-[2.5rem] text-left transition-all hover:border-black hover:bg-gray-50 shadow-xl overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <BoltIcon className="w-40 h-40 text-black/10" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-[10px] font-black text-black/50 uppercase tracking-[0.3em] mb-2 font-mono">Enrolled Sector</p>
                                    <h3 className="text-3xl font-black text-black uppercase italic">{course.title}</h3>
                                    <div className="mt-8 flex items-center gap-2 text-black group-hover:translate-x-2 transition-transform">
                                        <span className="text-xs font-bold uppercase tracking-widest">Enter Sector</span>
                                        <ChevronRightIcon className="w-4 h-4" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </HubWrapper>
        );
    }

    if (mode === 'select_game') {
        return (
            <HubWrapper>
                <div className="min-h-full flex flex-col items-center p-8 pt-20 space-y-12 overflow-y-auto custom-scrollbar">
                    <button
                        onClick={() => enrolledCourses.length > 1 ? setMode('select_subject') : onExit?.()}
                        className="absolute top-8 left-8 p-3 bg-white border border-gray-200 hover:border-black text-gray-400 hover:text-black rounded-2xl transition-all flex items-center gap-2 pr-6 shadow-xl"
                    >
                        <ChevronRightIcon className="w-4 h-4 rotate-180" />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {enrolledCourses.length > 1 ? 'Change Subject' : 'Student Portal'}
                        </span>
                    </button>

                    <div className="text-center">
                        <p className="text-[10px] font-black text-black/50 uppercase tracking-widest mb-1 font-mono">Current Subject</p>
                        <h2 className="text-5xl font-black text-black uppercase italic tracking-tighter">{selectedCourse?.title}</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
                        {subjectGames.map((game) => (
                            <button
                                key={game.id}
                                onClick={() => handleLaunchGame(game)}
                                className={`group relative bg-white border-2 border-gray-100 p-8 rounded-[2.5rem] text-left transition-all hover:shadow-2xl overflow-hidden hover:border-black/50 hover:bg-gray-50`}
                            >
                                <div className="relative z-10 flex flex-col h-full">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 border bg-gray-50 text-black border-gray-100`}>
                                        {game.type === 'voxel_quest' ? <CubeIcon className="w-7 h-7" /> :
                                            game.type === 'code_arena' ? <CodeBracketIcon className="w-7 h-7" /> :
                                                <CardIcon className="w-7 h-7" />}
                                    </div>
                                    <h3 className="text-2xl font-black text-black uppercase tracking-tight italic mb-2">{game.title}</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed mb-8 flex-1 font-medium">
                                        {game.description}
                                    </p>
                                    <div className="mt-auto flex items-center gap-2 group-hover:translate-x-2 transition-transform">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest text-black`}>Initialize Mission</span>
                                        <ChevronRightIcon className={`w-3 h-3 text-black`} />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </HubWrapper>
        );
    }

    if (mode === 'code_arena') {
        return (
            <div className="relative h-full">
                <BackButton />
                <CodingGame
                    courses={courses}
                    enrolledCourseIds={selectedCourse ? [selectedCourse.id] : enrolledCourseIds}
                    focus={activeGame?.focus}
                    onBack={() => setMode('select_game')}
                />
            </div>
        );
    }

    if (mode === 'voxel_quest') {
        return (
            <div className="relative h-full">
                <BackButton />
                <VoxelQuest
                    courses={courses}
                    enrolledCourseIds={selectedCourse ? [selectedCourse.id] : enrolledCourseIds}
                    focus={activeGame?.focus}
                    onBack={() => setMode('select_game')}
                />
            </div>
        );
    }

    if (mode === 'study_cards') {
        return (
            <div className="relative h-full">
                <BackButton />
                <StudyCards
                    courses={courses}
                    enrolledCourseIds={selectedCourse ? [selectedCourse.id] : enrolledCourseIds}
                    focus={activeGame?.focus}
                    onBack={() => setMode('select_game')}
                />
            </div>
        );
    }

    return null;
};

export default LumoGames;
