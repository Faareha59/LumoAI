import React, { useState, useEffect, useRef } from 'react';
import { VideoDraft, Course, CourseModule } from '../../types';
import { generateLectureForModule, generateImagesForSlides, generateImagesForSlidesViaOpenRouter, generateImagesForSlidesViaPexels, generateAudioForSlides } from '../../services/geminiService';
import { exportLectureToWebM } from '../../services/videoExporter';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { SparklesIcon, VideoIcon, XCircleIcon, SpeakerIcon, PlayIcon, PauseIcon } from '../Icons';

interface VideoGeneratorProps {
    course: Course;
    module: CourseModule;
    onPublish: (video: VideoDraft, courseId: string, moduleId: string) => void;
    onCancel: () => void;
}

type GenerationStep = 'idle' | 'drafting' | 'generating_audio' | 'done' | 'error';

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ course, module, onPublish, onCancel }) => {
    const [draft, setDraft] = useState<VideoDraft | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const [audioProgress, setAudioProgress] = useState({ current: 0, total: 0 });
    const [isExporting, setIsExporting] = useState(false);

    // State for slideshow preview
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    
    const currentSlide = draft?.slides[currentSlideIndex];
    
    // Automatically start the generation process when the component mounts
    useEffect(() => {
        handleCreateFullLecture();
    }, []);

    // Effect to handle playing audio
    useEffect(() => {
        if (isPlaying && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
        } else if (!isPlaying && audioRef.current) {
            audioRef.current.pause();
        }
    }, [isPlaying, currentSlideIndex, draft]);


    const handleCreateFullLecture = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // Step 1: Generate script, quiz, and image prompts from the module context
            setGenerationStep('drafting');
            const draftContents = await generateLectureForModule(course.title, module);
            
            // Step 2: Generate Image URLs via Pexels -> OpenRouter -> stock photos
            let imageUrls: string[] = [];
            try {
                imageUrls = await generateImagesForSlidesViaPexels(draftContents.slides);
            } catch {}
            if (!imageUrls.length || imageUrls.every(u => !u)) {
                try {
                    imageUrls = await generateImagesForSlidesViaOpenRouter(draftContents.slides, { size: '1280x720' });
                } catch {}
            }
            if (!imageUrls.length || imageUrls.every(u => !u)) {
                imageUrls = generateImagesForSlides(draftContents.slides);
            }

            let tempDraft: VideoDraft = {
                id: `draft-${Date.now()}`,
                ...draftContents,
                slides: draftContents.slides.map((slide, index) => ({
                    ...slide,
                    imageUrl: imageUrls[index],
                })),
            };
            setDraft({ ...tempDraft });

            // Step 3: Generate Audio for each slide sequentially
            setGenerationStep('generating_audio');
            setAudioProgress({ current: 0, total: tempDraft.slides.length });
            const audioUrls = await generateAudioForSlides(
                tempDraft.slides, 
                (current, total) => setAudioProgress({ current, total })
            );

            tempDraft.slides = tempDraft.slides.map((slide, index) => ({
                ...slide,
                audioUrl: audioUrls[index],
            }));
            
            setDraft({ ...tempDraft });
            setGenerationStep('done');

        } catch (e) {
            const err = e as Error;
            console.error(e);
            setError(err.message || 'An unknown error occurred during generation.');
            setGenerationStep('error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePlayPause = () => {
        setIsPlaying(prev => !prev);
    };
    
    const handleNavigation = (direction: 'next' | 'prev') => {
        setIsPlaying(false); // Pause on manual navigation
        if (direction === 'next' && draft) {
            setCurrentSlideIndex(prev => Math.min(draft.slides.length - 1, prev + 1));
        } else {
            setCurrentSlideIndex(prev => Math.max(0, prev - 1));
        }
    };
    
    const handleAudioEnded = () => {
        if (draft && currentSlideIndex < draft.slides.length - 1) {
            setCurrentSlideIndex(prev => prev + 1);
        } else {
            setIsPlaying(false); // End of lecture
        }
    };

    const handlePublish = () => {
        if (draft) {
            onPublish(draft, course.id, module.id);
        }
    };

    const handleExport = async () => {
        if (!draft) return;
        try {
            setIsExporting(true);
            const blob = await exportLectureToWebM(draft, { width: 1280, height: 720, fps: 30, defaultSlideDurationMs: 6000 });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${draft.title.replace(/[^a-z0-9\-\_]+/gi, '_')}.webm`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Failed to export video.');
        } finally {
            setIsExporting(false);
        }
    };
    
    const getLoadingMessage = () => {
        switch (generationStep) {
            case 'drafting':
                return 'Generating script, images, and quiz...';
            case 'generating_audio':
                return `Generating audio narration... (Slide ${audioProgress.current} of ${audioProgress.total})`;
            case 'done':
                 return 'Your lecture is ready to preview!';
            default:
                return 'Please wait...';
        }
    };

    const renderLoading = () => (
        <div className="bg-card border border-border rounded-lg p-6 h-96 flex items-center justify-center">
             <Loader text={getLoadingMessage()} />
        </div>
    );
    
    const renderError = () => (
         <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-700 mb-2">Generation Failed</h2>
            <p className="text-red-600 mb-6">{error}</p>
            <Button onClick={onCancel} variant="danger">Back to Dashboard</Button>
        </div>
    );

    const renderPreview = () => draft && (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold">{draft.title}</h2>
                    <p className="text-muted-foreground">For module: <span className="font-semibold">{module.title}</span></p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button onClick={handleExport} variant="secondary" disabled={isExporting}>{isExporting ? 'Exporting…' : 'Export Video'}</Button>
                    <Button onClick={handlePublish} variant="primary">Publish Lecture</Button>
                    <Button onClick={onCancel} variant="secondary">Cancel</Button>
                </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2"><VideoIcon className="w-6 h-6"/>Lecture Preview</h3>
                
                <div className="relative aspect-video bg-background rounded-lg overflow-hidden border border-border mb-4">
                    {currentSlide?.imageUrl ? (
                        <img src={currentSlide.imageUrl} alt={`Slide ${currentSlideIndex + 1}`} className="w-full h-full object-cover animate-fade-in" key={currentSlideIndex} />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-card">
                            <VideoIcon className="w-16 h-16 text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground">Image not available.</p>
                        </div>
                    )}
                </div>

                <div className="w-full bg-background rounded-full h-2 my-4 border border-border">
                    <div 
                        className="bg-foreground h-full rounded-full transition-all duration-300" 
                        style={{ width: `${((currentSlideIndex + 1) / draft.slides.length) * 100}%` }}
                    ></div>
                </div>
                
                <div className="flex items-center justify-between gap-4">
                     <Button 
                        onClick={() => handleNavigation('prev')}
                        disabled={currentSlideIndex === 0}
                    >
                        Previous
                    </Button>

                     <Button onClick={handlePlayPause} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>
                        {isPlaying ? <PauseIcon className="w-5 h-5"/> : <PlayIcon className="w-5 h-s"/>}
                     </Button>
                    
                    <Button 
                        onClick={() => handleNavigation('next')}
                        disabled={currentSlideIndex === draft.slides.length - 1}
                    >
                        Next
                    </Button>
                </div>

                 <div className="mt-6 border-t border-border pt-4">
                    <h4 className="text-lg font-semibold mb-2 flex items-center gap-2"><SpeakerIcon className="w-5 h-5"/>Narration</h4>
                    <div className="flex items-center gap-4">
                        <audio 
                            ref={audioRef} 
                            src={currentSlide?.audioUrl}
                            key={currentSlide?.audioUrl}
                            onEnded={handleAudioEnded}
                            className="hidden"
                        />
                        <p className="text-sm text-muted-foreground italic min-h-[40px]">
                            {currentSlide?.audioUrl ? `"${currentSlide.description}"` : (generationStep === 'generating_audio' ? "Generating audio..." : "Audio not available.")}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Quiz Questions ({draft.quiz.length})</h3>
                <ul className="space-y-4 max-h-96 overflow-y-auto pr-4">
                    {draft.quiz.map((q, i) => (
                        <li key={i}>
                            <p className="font-semibold">{i + 1}. {q.question}</p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                                {q.options.map((opt, j) => (
                                    <li key={j} className={opt === q.correctAnswer ? 'text-green-400 font-bold' : ''}>{opt}</li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );

    const renderContent = () => {
        if (generationStep === 'error') return renderError();
        if (isLoading || generationStep !== 'done') return renderLoading();
        if (generationStep === 'done' && draft) return renderPreview();
        return null; // Should not be reached
    };

    return (
        <div className="p-4 md:p-8">
            <div className="flex items-center gap-4 mb-8">
                <SparklesIcon className="w-8 h-8 text-muted-foreground" />
                <h1 className="text-3xl font-bold">Generate Lecture</h1>
            </div>

            <div className="max-w-4xl mx-auto">
                {renderContent()}
            </div>
        </div>
    );
};

export default VideoGenerator;
