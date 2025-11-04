import React, { useState, useRef, useEffect } from 'react';
import { VideoDraft, QuizQuestion } from '../../types';
import Button from '../common/Button';
import { CheckCircleIcon, XCircleIcon, PlayIcon, PauseIcon, VideoIcon } from '../Icons';

interface LectureViewerProps {
    lecture: VideoDraft;
    onBack: () => void;
}

const LectureViewer: React.FC<LectureViewerProps> = ({ lecture, onBack }) => {
    const [view, setView] = useState<'lecture' | 'quiz' | 'results'>('lecture');
    const [userAnswers, setUserAnswers] = useState<string[]>([]);
    const [score, setScore] = useState(0);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const currentSlide = lecture.slides[currentSlideIndex];

    // Effect to handle playing audio when slide changes or play state changes
    useEffect(() => {
        if (isPlaying && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
        } else if (!isPlaying && audioRef.current) {
            audioRef.current.pause();
        }
    }, [isPlaying, currentSlideIndex]);

    const handleSelectAnswer = (questionIndex: number, answer: string) => {
        setUserAnswers(prev => {
            const newAnswers = [...prev];
            newAnswers[questionIndex] = answer;
            return newAnswers;
        });
    };

    const handleSubmitQuiz = () => {
        let correctCount = 0;
        lecture.quiz.forEach((q, index) => {
            if (userAnswers[index] === q.correctAnswer) {
                correctCount++;
            }
        });
        setScore(correctCount);
        setView('results');
    };
    
    const handlePlayPause = () => {
        setIsPlaying(prev => !prev);
    };

    const handleNavigation = (direction: 'next' | 'prev') => {
        setIsPlaying(false); // Pause on manual navigation
        if (direction === 'next') {
            setCurrentSlideIndex(prev => Math.min(lecture.slides.length - 1, prev + 1));
        } else {
            setCurrentSlideIndex(prev => Math.max(0, prev - 1));
        }
    };
    
    // Autoplay to next slide when current audio finishes
    const handleAudioEnded = () => {
        if (currentSlideIndex < lecture.slides.length - 1) {
            setCurrentSlideIndex(prev => prev + 1);
        } else {
            setIsPlaying(false); // End of lecture
        }
    };
    
    const renderLecture = () => (
        <>
            <div className="relative aspect-video bg-background rounded-lg overflow-hidden border border-border mb-4">
               {currentSlide?.imageUrl ? (
                    <img 
                        src={currentSlide.imageUrl} 
                        alt={`Slide ${currentSlideIndex + 1}`}
                        className="w-full h-full object-cover animate-fade-in"
                        key={currentSlideIndex} // Force re-render for animation
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-card">
                         <VideoIcon className="w-16 h-16 text-muted-foreground/50 mb-4" />
                         <p className="text-muted-foreground">Image not available.</p>
                    </div>
                )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4 mb-4 min-h-[100px] flex items-center justify-center">
                <p className="text-muted-foreground italic text-center">
                    {currentSlide?.description}
                </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-card rounded-full h-2 mb-4 border border-border">
                <div 
                    className="bg-foreground h-full rounded-full transition-all duration-300" 
                    style={{ width: `${((currentSlideIndex + 1) / lecture.slides.length) * 100}%` }}
                ></div>
            </div>

            <div className="flex items-center justify-between gap-4 mb-6">
                <Button 
                    onClick={() => handleNavigation('prev')}
                    disabled={currentSlideIndex === 0}
                    variant="secondary"
                >
                    Previous
                </Button>
                
                <div className="flex flex-col items-center">
                     <Button onClick={handlePlayPause} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>
                         {isPlaying ? <PauseIcon className="w-6 h-6"/> : <PlayIcon className="w-6 h-6"/>}
                     </Button>
                     <audio 
                        ref={audioRef} 
                        src={currentSlide?.audioUrl}
                        onEnded={handleAudioEnded}
                        key={currentSlide?.audioUrl} // Important to re-create element on src change
                        className="hidden"
                     />
                </div>

                <Button 
                    onClick={() => handleNavigation('next')}
                    disabled={currentSlideIndex === lecture.slides.length - 1}
                     variant="secondary"
                >
                    Next
                </Button>
            </div>
            
            <div className="mt-6 flex justify-end">
                <Button onClick={() => setView('quiz')}>Skip to Quiz</Button>
            </div>
        </>
    );

    const renderQuizQuestion = (q: QuizQuestion, index: number) => (
        <div key={index} className="bg-card border border-border rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">{index + 1}. {q.question}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.options.map(option => (
                    <Button 
                        key={option} 
                        variant={userAnswers[index] === option ? 'primary' : 'secondary'}
                        onClick={() => handleSelectAnswer(index, option)}
                        className="text-left justify-start"
                    >
                        {option}
                    </Button>
                ))}
            </div>
        </div>
    );
    
    const renderResults = () => (
        <div className="text-center bg-card border border-border rounded-lg p-8">
            <h2 className="text-3xl font-bold mb-4">Quiz Completed!</h2>
            <p className="text-5xl font-bold mb-4">{lecture.quiz.length > 0 ? Math.round((score / lecture.quiz.length) * 100) : 0}%</p>
            <p className="text-muted-foreground mb-8">You answered {score} out of {lecture.quiz.length} questions correctly.</p>
            <div className="space-y-6 text-left max-w-2xl mx-auto">
                {lecture.quiz.map((q, i) => (
                    <div key={i}>
                        <p className="font-semibold">{q.question}</p>
                        <p className={`flex items-center gap-2 mt-1 ${userAnswers[i] === q.correctAnswer ? 'text-green-400' : 'text-red-400'}`}>
                           {userAnswers[i] === q.correctAnswer ? <CheckCircleIcon className="w-5 h-5"/> : <XCircleIcon className="w-5 h-5"/>}
                           Your answer: {userAnswers[i] || "No answer"}
                        </p>
                        {userAnswers[i] !== q.correctAnswer && (
                            <p className="text-green-400 ml-7">Correct answer: {q.correctAnswer}</p>
                        )}
                    </div>
                ))}
            </div>
            <Button onClick={() => { setUserAnswers([]); setView('quiz'); }} className="mt-8 mr-4">Retake Quiz</Button>
            <Button onClick={onBack} variant="secondary" className="mt-8">Back to Dashboard</Button>
        </div>
    );

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    <Button onClick={onBack} variant="secondary" className="mb-4">← Back to Dashboard</Button>
                    <h1 className="text-4xl font-bold">{lecture.title}</h1>
                    <p className="text-muted-foreground mt-2">{lecture.summary}</p>
                </div>
                
                <div className="flex flex-col flex-grow">
                    {view === 'lecture' && renderLecture()}
                    {view === 'quiz' && (
                        <div>
                            {lecture.quiz.map(renderQuizQuestion)}
                            <Button onClick={handleSubmitQuiz} disabled={userAnswers.filter(Boolean).length !== lecture.quiz.length} className="w-full">Submit Quiz</Button>
                        </div>
                    )}
                    {view === 'results' && renderResults()}
                </div>
            </div>
        </div>
    );
};

export default LectureViewer;