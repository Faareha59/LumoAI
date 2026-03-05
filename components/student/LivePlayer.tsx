import React, { useEffect, useRef, useState } from 'react';
import { VideoIcon, XCircleIcon, PlayIcon, CheckCircleIcon, PdfExplainerIcon } from '../Icons';
import type { VideoDraft } from '../../types';
import { drawSlide, renderPdfPageToDataUrl } from '../../services/videoExporter';
import * as pdfjsLib from 'pdfjs-dist';

// Use a reliable fixed version for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface LivePlayerProps {
    draft: VideoDraft;
    onClose: () => void;
    autoPlayNext?: boolean;
    startOffset?: number;
}

const base64ToUint8Array = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const LivePlayer: React.FC<LivePlayerProps> = ({ draft, onClose, startOffset = 0 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const sidebarCanvasRef = useRef<HTMLCanvasElement>(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [progress, setProgress] = useState(0);
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const requestRef = useRef<number>(null);
    const [displayIndex, setDisplayIndex] = useState(0);
    const [assets, setAssets] = useState<{ bgImg: HTMLImageElement | null; snapImg: HTMLImageElement | null }>({ bgImg: null, snapImg: null });
    const [isReady, setIsReady] = useState(false);
    const lastEndedIndex = useRef<number>(-1);
    const [manualPage, setManualPage] = useState(1);
    const [manualSnapImg, setManualSnapImg] = useState<HTMLImageElement | null>(null);
    const [isAutoSync, setIsAutoSync] = useState(true);

    // Auto-advance logic handled via handleEnded and nextSlide to prevent skipping.


    // Load PDF Document
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                if (draft.pdfDocumentBase64) {
                    const uint8 = base64ToUint8Array(draft.pdfDocumentBase64);
                    const pdf = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
                    if (active) {
                        setPdfDoc(pdf);
                        setIsLoaded(true);
                        console.log('[Live] PDF Document loaded from base64');
                    }
                } else if (draft.pdfId) {
                    console.log('[Live] Fetching PDF from material ID:', draft.pdfId);
                    const res = await fetch(`/api/materials/${draft.pdfId}/download`);
                    if (!res.ok) throw new Error('Failed to download PDF source');
                    const arrayBuffer = await res.arrayBuffer();
                    const uint8 = new Uint8Array(arrayBuffer);
                    const pdf = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
                    if (active) {
                        setPdfDoc(pdf);
                        setIsLoaded(true);
                        console.log('[Live] PDF Document loaded from server');
                    }
                } else {
                    if (active) setIsLoaded(true);
                }
            } catch (err) {
                console.error('[Live] PDF Loading Error:', err);
                if (active) setIsLoaded(true);
            }
        })();
        return () => { active = false; };
    }, [draft.pdfDocumentBase64, draft.pdfId]);

    // Step-by-step Asset Loading
    useEffect(() => {
        const targetSlide = draft.slides[currentSlideIndex];
        if (!targetSlide || !isLoaded) {
            setIsReady(false);
            return;
        }

        setIsReady(false);
        let active = true;
        (async () => {
            const promises: Promise<any>[] = [];
            let slideBgImg: HTMLImageElement | null = null;
            let snapImg: HTMLImageElement | null = null;

            // AI Background Imagery is now disabled as per User Request for a clean technical experience.
            /*
            if (targetSlide.imageUrl) {
                promises.push(new Promise((res) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => { slideBgImg = img; res(null); };
                    img.onerror = (e) => {
                        console.error('[Live] BG Image Load Failed:', targetSlide.imageUrl, e);
                        res(null);
                    };
                    img.src = targetSlide.imageUrl!;
                }));
            }
            */
            // Skipping await for images to keep it manual and text-focused
            if (!active) return;

            setAssets(prev => ({ ...prev, bgImg: null }));
            setDisplayIndex(currentSlideIndex);
            setIsReady(true);
        })();

        return () => { active = false; };
    }, [currentSlideIndex, isLoaded, draft, pdfDoc]);

    // Independent PDF Page Loading
    useEffect(() => {
        if (!pdfDoc) return;
        let active = true;
        (async () => {
            try {
                const dataUrl = await renderPdfPageToDataUrl(pdfDoc, manualPage, 800);
                if (dataUrl && active) {
                    const img = new Image();
                    img.onload = () => {
                        if (active) setManualSnapImg(img);
                    };
                    img.src = dataUrl;
                }
            } catch (e) {
                console.error('[Live] PDF render failed', e);
            }
        })();
        return () => { active = false; };
    }, [pdfDoc, manualPage]);

    // Sync Manual PDF Page to the current slide's logic
    useEffect(() => {
        if (!isAutoSync) return;
        const currentSlide = draft.slides[displayIndex];
        if (currentSlide && currentSlide.pdfPage) {
            setManualPage(currentSlide.pdfPage);
        }
    }, [displayIndex, draft.slides, isAutoSync]);

    // Initialize manualPage only ONCE per JOB load
    // We use draft.id to be stable. If polling updates the draft, draft.id remains same.
    const lastInitializedId = useRef<string | null>(null);
    useEffect(() => {
        if (!draft || !pdfDoc) return;
        if (lastInitializedId.current === draft.id) return;

        console.log('[Live] Initializing manual PDF page for Job:', draft.id);
        if (draft.slides[0] && draft.slides[0].pdfPage) {
            setManualPage(draft.slides[0].pdfPage);
        } else {
            setManualPage(1);
        }
        lastInitializedId.current = draft.id;
    }, [draft?.id, !!pdfDoc]);

    const nextSlide = () => {
        if (currentSlideIndex < draft.slides.length - 1) {
            setCurrentSlideIndex(prev => prev + 1);
            setIsPlaying(true);
        }
    };
    const prevSlide = () => {
        if (currentSlideIndex > 0) {
            setCurrentSlideIndex(prev => prev - 1);
            setIsPlaying(true);
        }
    };

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' && pdfDoc) {
                setManualPage(prev => Math.min(pdfDoc.numPages, prev + 1));
            } else if (e.key === 'ArrowLeft' && pdfDoc) {
                setManualPage(prev => Math.max(1, prev - 1));
            } else if (e.key === ' ') {
                e.preventDefault();
                if (audioRef.current) {
                    if (audioRef.current.paused) audioRef.current.play();
                    else audioRef.current.pause();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pdfDoc]);

    // Draw Sidebar
    const drawSidebar = () => {
        if (sidebarCanvasRef.current && manualSnapImg) {
            const sCanvas = sidebarCanvasRef.current;
            const sCtx = sCanvas.getContext('2d');
            if (sCtx) {
                sCtx.clearRect(0, 0, sCanvas.width, sCanvas.height);
                const img = manualSnapImg;
                const scale = Math.min(sCanvas.width / img.width, sCanvas.height / img.height);
                const x = (sCanvas.width / 2) - (img.width / 2) * scale;
                const y = (sCanvas.height / 2) - (img.height / 2) * scale;
                sCtx.drawImage(img, x, y, img.width * scale, img.height * scale);
            }
        }
    };

    useEffect(() => {
        drawSidebar();
    }, [manualSnapImg]);

    // Main Animation Loop
    useEffect(() => {
        if (!isReady || !canvasRef.current || !isLoaded) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const animate = () => {
            if (!canvas || !ctx) return;
            const slide = draft.slides[displayIndex];
            if (!slide) return;

            const currentTime = audioRef.current?.currentTime || 0;
            const dur = isFinite(audioRef.current?.duration || NaN) ? audioRef.current!.duration : 8;
            const prog = Math.min(currentTime / Math.max(dur, 0.1), 1);
            setProgress(prog);

            drawSlide(ctx, slide as any, assets.bgImg, null, canvas.width, canvas.height, displayIndex, draft.slides.length, prog, false);

            if (isPlaying) {
                drawSidebar();
                requestRef.current = requestAnimationFrame(animate);
            }
        };

        if (isPlaying) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            const slide = draft.slides[displayIndex];
            if (slide) {
                drawSlide(ctx, slide as any, assets.bgImg, null, canvas.width, canvas.height, displayIndex, draft.slides.length, audioRef.current?.currentTime ? progress : 0, false);
            }
            drawSidebar();
        }

        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    }, [displayIndex, assets, isReady, isPlaying, isLoaded, draft]);

    const handleEnded = () => {
        const audio = audioRef.current;
        if (!audio) return;

        // Ensure slide actually finished to prevent skipping
        if (audio.currentTime < audio.duration - 0.5 && !audio.ended) {
            console.log('[Live] Ignoring premature end event');
            return;
        }

        if (lastEndedIndex.current === currentSlideIndex) return;
        lastEndedIndex.current = currentSlideIndex;

        if (currentSlideIndex < draft.slides.length - 1) {
            nextSlide();
        } else {
            setIsPlaying(false);
        }
    };

    const forcePlay = () => {
        if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(() => { });
            setIsPlaying(true);
        }
    };

    const isBuffering = draft.status !== 'done' &&
        currentSlideIndex >= draft.slides.length - 1 &&
        (audioRef.current?.ended || audioRef.current?.currentTime === 0);

    return (
        <div
            className="w-full h-full flex flex-col bg-black text-white overflow-hidden font-sans select-none relative"
            id="lumo-study-player"
            onClick={forcePlay}
        >
            <div className="flex items-center justify-between p-6 bg-gradient-to-b from-black/90 to-transparent absolute top-0 inset-x-0 z-20 pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <div className="flex flex-col">
                        <h3 className="font-extrabold text-lg tracking-tight text-white drop-shadow-md">{draft.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5 opacity-60">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white">{startOffset + currentSlideIndex + 1} / {startOffset + draft.slides.length || '?'} Topics</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 pointer-events-auto">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all"><XCircleIcon className="w-8 h-8 opacity-70 hover:opacity-100" /></button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 flex flex-col items-center justify-center bg-black relative">
                    <div className="relative aspect-video w-full max-h-screen">
                        <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-contain" />

                        {!isLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4">
                                <div className="w-12 h-12 border-2 border-white/20 border-t-white animate-spin rounded-full" />
                                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40">Loading Assets</p>
                            </div>
                        )}

                        {isLoaded && isBuffering && (
                            <div className="absolute top-28 left-8 flex items-center gap-3 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-2xl z-10 transition-all animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Building next slide...</span>
                            </div>
                        )}

                        {isReady && !isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10 group cursor-pointer" onClick={forcePlay}>
                                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-2xl scale-110 group-hover:scale-125 transition-transform duration-500">
                                    <PlayIcon className="w-10 h-10 ml-1 text-black" />
                                </div>
                                <p className="absolute bottom-1/3 text-xs font-bold tracking-[0.3em] uppercase opacity-60">Autoplay paused. Click to start.</p>
                            </div>
                        )}

                        <audio
                            ref={audioRef}
                            src={draft.slides[displayIndex]?.audioUrl}
                            autoPlay
                            onEnded={handleEnded}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onError={(e) => console.warn('Audio playback error:', e)}
                        />

                        {draft.slides[displayIndex]?.description && (
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 max-w-[85%] w-full flex justify-center pointer-events-none">
                                <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10 shadow-2xl animate-fade-in">
                                    <p className="text-white text-lg font-bold text-center leading-relaxed">
                                        {draft.slides[displayIndex]?.description}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {pdfDoc && (
                    <div className="w-[380px] border-l border-white/10 bg-black/50 backdrop-blur-xl flex flex-col animate-fade-in transition-all">
                        <div className="p-5 border-b border-white/5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <PdfExplainerIcon className="w-4 h-4 text-white" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Source Reference</span>
                                    </div>
                                    <p className={`text-[9px] uppercase mt-1 font-bold ${isAutoSync ? 'text-white' : 'text-white/30'}`}>
                                        {isAutoSync ? 'AI Sync Active' : 'Manual Mode'}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsAutoSync(true);
                                        const topicPage = draft.slides[displayIndex]?.pdfPage || 1;
                                        setManualPage(topicPage);
                                    }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border transition-all ${isAutoSync ? 'bg-white text-black border-white' : 'bg-white/10 hover:bg-white/20 text-white border-white/20'}`}
                                >
                                    {isAutoSync ? 'Synced' : 'Sync to Slide'}
                                </button>
                            </div>

                            <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/10">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsAutoSync(false);
                                        setManualPage(prev => Math.max(1, prev - 1));
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white disabled:opacity-30"
                                    disabled={manualPage <= 1}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <div className="flex flex-col items-center">
                                    <span className="text-[12px] font-black text-white">
                                        {manualPage} / {pdfDoc.numPages}
                                    </span>
                                    <span className="text-[8px] text-white/30 uppercase font-black tracking-tighter">Current View</span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsAutoSync(false);
                                        setManualPage(prev => Math.min(pdfDoc.numPages, prev + 1));
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white disabled:opacity-30"
                                    disabled={manualPage >= pdfDoc.numPages}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-black p-4 flex items-center justify-center">
                            <canvas
                                ref={sidebarCanvasRef}
                                width={800}
                                height={1100}
                                className="w-full h-auto shadow-2xl border border-white/10 rounded-lg"
                            />
                        </div>
                        <div className="p-5 bg-black/20 text-[11px] leading-relaxed text-gray-400 space-y-3">
                            <div className="flex items-center gap-2 text-white font-bold mb-1">
                                <div className="w-1 h-3 bg-white rounded-full" />
                                <span className="uppercase tracking-widest text-[9px]">Context Excerpt</span>
                            </div>
                            <p className="line-clamp-[8] font-medium italic">
                                "{draft.slides[displayIndex]?.pdfExcerpt || "Lumo AI is analyzing the visual context of this slide to provide deep technical insights."}"
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="h-24 bg-gradient-to-t from-black to-transparent flex items-center px-8 relative z-20">
                <div className="max-w-6xl mx-auto w-full flex items-center gap-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={prevSlide}
                            disabled={currentSlideIndex === 0}
                            className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-full text-white transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                            onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}
                            className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-white/30 group"
                        >
                            {isPlaying ? <div className="flex gap-1"><div className="w-1.5 h-5 bg-black rounded-full" /><div className="w-1.5 h-5 bg-black rounded-full" /></div> : <PlayIcon className="w-7 h-7 ml-1" />}
                        </button>
                        <button
                            onClick={nextSlide}
                            disabled={currentSlideIndex >= draft.slides.length - 1}
                            className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-full text-white transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 group">
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Topic {startOffset + currentSlideIndex + 1}</span>
                                <span className="bg-white/10 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{draft.slides[displayIndex]?.heading || 'Processing'}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-white/40">{Math.round((currentSlideIndex + progress) / Math.max(1, draft.slides.length) * 100)}% COMPLETE</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative border border-white/5">
                            <div
                                className="h-full bg-white transition-all duration-300"
                                style={{ width: `${(currentSlideIndex + progress) / Math.max(1, draft.slides.length) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LivePlayer;
