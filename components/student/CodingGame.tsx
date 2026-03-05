import React, { useState, useEffect, useMemo, useRef } from 'react';
import Button from '../common/Button';
import { CodeBracketIcon, SparklesIcon, XCircleIcon, CheckCircleIcon } from '../Icons';
import { generateCodingChallenges } from '../../services/geminiService';
import type { Course } from '../../types';

interface Challenge {
  id: number;
  title: string;
  scenario: string;
  question: string;
  code: string;
  answer: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  hint: string;
}

interface CodingGameProps {
  courses: Course[];
  enrolledCourseIds: string[];
  focus?: string;
  onBack?: () => void;
}

const CodingGame: React.FC<CodingGameProps> = ({ courses, enrolledCourseIds, focus, onBack }) => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'hint', msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showBoss, setShowBoss] = useState(false);

  const successSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'));
  const failSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3'));
  const clickSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'));
  const introSound = useRef(new Audio('/amazing-female-gfx-sounds-1-1-00-01.mp3'));

  useEffect(() => {
    const loadChallenges = async () => {
      setLoading(true);
      try {
        const enrolled = courses.filter(c => enrolledCourseIds.includes(c.id));
        const topics = enrolled.length > 0 ? enrolled.map(c => c.title) : ['JavaScript Basics', 'Data Structures'];
        const data = await generateCodingChallenges(topics, focus);
        setChallenges(data);
        introSound.current.play().catch(() => { });
      } catch (err) {
        console.error("Failed to load challenges:", err);
      } finally {
        setLoading(false);
      }
    };
    loadChallenges();
  }, [courses, enrolledCourseIds, focus]);

  const currentChallenge = challenges[currentIdx];

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentChallenge) return;

    if (userAnswer.trim().toLowerCase() === currentChallenge.answer.toLowerCase()) {
      successSound.current.play().catch(() => { });
      setFeedback({ type: 'success', msg: "SYSTEM BREACH SUCCESSFUL! +100 XP" });
      setScore(prev => prev + 100 + (combo * 20));
      setCombo(prev => prev + 1);

      setTimeout(() => {
        setFeedback(null);
        setUserAnswer('');
        if (currentIdx < challenges.length - 1) {
          setCurrentIdx(prev => prev + 1);
          setLevel(prev => prev + 1);
        } else {
          setShowBoss(true);
        }
      }, 2000);
    } else {
      failSound.current.play().catch(() => { });
      setFeedback({ type: 'error', msg: "ACCESS DENIED: FIREWALL DETECTED" });
      setCombo(0);
    }
  };

  const showHint = () => {
    clickSound.current.play().catch(() => { });
    setFeedback({ type: 'hint', msg: `LUMO TIP: ${currentChallenge?.hint}` });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-gray-400 font-mono p-8">
        <div className="w-24 h-24 border-4 border-white border-t-transparent animate-spin rounded-full mb-8 shadow-[0_0_30px_rgba(255,255,255,0.1)]"></div>
        <p className="text-xl animate-pulse tracking-[0.5em] uppercase">Initializing Lumo Arena...</p>
      </div>
    );
  }

  if (showBoss) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white font-mono p-8 text-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900/40 via-black to-black">
        <SparklesIcon className="w-24 h-24 text-white mb-6 animate-bounce" />
        <h1 className="text-6xl font-black mb-4 tracking-tighter uppercase italic">Grand Master!</h1>
        <p className="text-2xl text-gray-300 mb-8 max-w-lg">You have decoded all systems in the current sector. Lumo has evolved!</p>
        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl mb-8">
          <p className="text-6xl font-black text-white">SCORE: {score}</p>
        </div>
        <Button onClick={onBack} className="px-12 py-6 text-xl">Exit Arena</Button>
      </div>
    );
  }

  if (!currentChallenge && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-gray-400 font-mono p-8">
        <p className="mb-6 opacity-60">No challenges detected. Systems offline.</p>
        <Button onClick={onBack}>Return to Hub</Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-black flex flex-col items-center p-4 md:p-8 font-mono select-none overflow-y-auto">
      {/* Game Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-8 pb-4 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_10px_rgb(255,255,255)]"></div>
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Lumo Code Arena v2.1.0</span>
        </div>
        <div className="flex gap-8">
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase font-black">Level</p>
            <p className="text-2xl font-black text-white">{level}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase font-black">Score</p>
            <p className="text-2xl font-black text-white">{score}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-500 uppercase font-black">Combo</p>
            <p className={`text-2xl font-black ${combo > 0 ? 'text-white animate-bounce' : 'text-gray-500'}`}>x{combo}</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Visual Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-950 ring-1 ring-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CodeBracketIcon className="w-32 h-32 text-white" />
            </div>

            <div className="relative z-10">
              <div className="inline-block px-3 py-1 bg-white/10 text-white rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-white/20">
                {currentChallenge?.difficulty} Difficulty
              </div>
              <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tight">{currentChallenge?.title}</h2>
              <p className="text-gray-300 text-sm leading-relaxed mb-6 italic border-l-2 border-white pl-4 bg-white/5 py-2">
                "{currentChallenge?.scenario}"
              </p>

              <div className="bg-black/50 rounded-2xl p-6 border border-white/5 font-mono text-sm overflow-x-auto custom-scrollbar">
                <p className="text-white/40 mb-3 text-[10px] uppercase font-black tracking-widest">// MISSION OBJECTIVE</p>
                <p className="text-white mb-6 font-bold">{currentChallenge?.question}</p>

                <div className="bg-black p-6 rounded-xl border border-white/10 shadow-inner">
                  <pre className="text-gray-300 whitespace-pre-wrap">
                    <code>{currentChallenge?.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Alert */}
          {feedback && (
            <div className={`p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2 duration-300 border ${feedback.type === 'success' ? 'bg-white/10 border-white text-white' :
              feedback.type === 'error' ? 'bg-black border-gray-800 text-gray-400' :
                'bg-gray-900 border-gray-700 text-gray-300'
              }`}>
              {feedback.type === 'success' ? <CheckCircleIcon className="w-6 h-6" /> :
                feedback.type === 'error' ? <XCircleIcon className="w-6 h-6" /> :
                  <SparklesIcon className="w-6 h-6" />}
              <span className="text-xs font-black uppercase tracking-widest">{feedback.msg}</span>
            </div>
          )}
        </div>

        {/* Tactical Section */}
        <div className="space-y-6">
          <div className="bg-gray-950 ring-1 ring-white/10 rounded-3xl p-6 shadow-2xl">
            <p className="text-[10px] text-white/30 uppercase font-black mb-6 tracking-[0.2em]">Input Terminal</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => {
                    setUserAnswer(e.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Enter Access Code..."
                  className="w-full h-16 bg-black border border-white/20 rounded-2xl px-6 text-white font-bold focus:outline-none focus:border-white transition-all placeholder:text-white/10"
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/5 font-black text-2xl tracking-tighter">CMD</div>
              </div>

              <button
                type="submit"
                disabled={!userAnswer}
                className="w-full py-4 bg-white text-black hover:bg-gray-200 disabled:opacity-20 disabled:hover:bg-white font-black rounded-2xl transition-all shadow-xl active:scale-95 uppercase tracking-widest text-xs"
              >
                Execute Decode
              </button>
            </form>

            <button
              onClick={showHint}
              className="w-full mt-4 py-4 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-white/5"
            >
              Request Decryption Hint (-$0 XP)
            </button>
          </div>

          <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
            <p className="text-[10px] text-gray-400 uppercase font-black mb-4 tracking-widest">Lumo Mentor AI</p>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-white flex-shrink-0 flex items-center justify-center">
                <SparklesIcon className="w-5 h-5 text-black" />
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed italic">
                "Keep your focus, trainee. The code is logic made manifest. If you hit a wall, look for patterns in the syntax."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingGame;