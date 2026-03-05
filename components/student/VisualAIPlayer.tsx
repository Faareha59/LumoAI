import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XCircleIcon, VideoIcon, SparklesIcon } from '../Icons';
import LivePlayer from './LivePlayer';
import type { VideoDraft } from '../../types';

interface VisualAIPlayerProps {
    materialId: string;
    topic: string;
    courseId: string;
    moduleId: string;
    onClose: () => void;
}

type PipelineStage = 'idle' | 'analyzing' | 'drafting' | 'narrating' | 'done' | 'error';

const VisualAIPlayer: React.FC<VisualAIPlayerProps> = ({ materialId, topic, courseId, moduleId, onClose }) => {
    const API_BASE = (typeof window !== 'undefined' && String(window.location?.origin || '').startsWith('file:')) ? 'http://localhost:8765' : '';
    const [stage, setStage] = useState<PipelineStage>('idle');
    const [statusMessage, setStatusMessage] = useState('Select video range to begin...');
    const [draft, setDraft] = useState<VideoDraft | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [slideRange, setSlideRange] = useState('1-30');
    const pollRef = useRef<number | null>(null);
    const hasStarted = useRef(false);

    const getToken = () => localStorage.getItem('token');

    const startPolling = useCallback((jobId: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = window.setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/pdf-explainer/status?jobId=${jobId}`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (!res.ok) throw new Error('Failed to fetch status');
                const data = await res.json();

                setStage(data.status);
                if (data.message) setStatusMessage(data.message);
                if (data.draft) setDraft(data.draft);

                if (data.status === 'done' || data.status === 'error') {
                    if (pollRef.current) clearInterval(pollRef.current);
                }
                if (data.error) setError(data.error);
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2000);
    }, [API_BASE]);

    const startExplainer = useCallback(async () => {
        if (hasStarted.current) return;
        hasStarted.current = true;
        setStage('analyzing');
        setStatusMessage('Starting AI Visual Production...');

        try {
            const maybeGroq = localStorage.getItem('GROQ_API_KEY');
            const formData = new FormData();
            if (materialId) formData.append('materialId', materialId);
            if (topic) formData.append('topic', topic);
            if (courseId) formData.append('courseId', courseId);
            if (moduleId) formData.append('moduleId', moduleId);
            formData.append('slideRange', slideRange);

            const res = await fetch(`${API_BASE}/api/pdf-explainer/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    ...(maybeGroq ? { 'x-groq-key': maybeGroq } : {})
                },
                body: formData
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to start AI Visual Studio');
            }

            const data = await res.json();
            startPolling(data.jobId);
        } catch (err: any) {
            setStage('error');
            setError(err.message || 'Failed to connect to AI Studio');
        }
    }, [materialId, topic, courseId, moduleId, slideRange, startPolling, API_BASE]);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="relative">
                <div className="w-24 h-24 border-4 border-black/10 border-t-black animate-spin rounded-full"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <SparklesIcon className="w-10 h-10 text-black animate-pulse" />
                </div>
            </div>
            <div className="space-y-2">
                <h3 className="text-2xl font-black text-black tracking-tight uppercase">AI Studio Producing</h3>
                <p className="text-gray-500 font-medium max-w-xs mx-auto text-sm leading-relaxed">{statusMessage}</p>
            </div>
            <div className="flex gap-2">
                {['Analyzing', 'Drafting', 'Narrating'].map((s, idx) => {
                    const isActive = stage.toLowerCase().includes(s.toLowerCase()) ||
                        (stage === 'done' && idx < 3) ||
                        (stage === 'drafting' && idx === 0) ||
                        (stage === 'narrating' && idx <= 1);
                    return (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`h-1 w-12 rounded-full transition-all duration-500 ${isActive ? 'bg-black shadow-[0_0_10px_rgba(0,0,0,0.2)]' : 'bg-gray-200'}`} />
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'text-black' : 'text-gray-300'}`}>{s}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderConfig = () => (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-[2rem] shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
            <div className="space-y-3">
                <div className="w-20 h-20 bg-black/5 text-black rounded-3xl flex items-center justify-center mx-auto mb-4 rotate-3 group-hover:rotate-6 transition-transform border border-black/10">
                    <VideoIcon className="w-10 h-10" />
                </div>
                <h3 className="text-3xl font-black text-black tracking-tight uppercase">Visual Studio Pro</h3>
                <p className="text-gray-500 font-medium max-w-sm mx-auto text-sm leading-relaxed">
                    Configure your high-quality deep-dive video production. Select a batch of 10 slides to generate.
                </p>
            </div>

            <div className="w-full space-y-6">
                <div className="flex flex-col gap-3 text-left">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Slide Range</label>
                    <div className="grid grid-cols-1 gap-3">
                        {['1-10', '11-20', '21-30', '31-40', '41-50'].map((range) => (
                            <button
                                key={range}
                                onClick={() => setSlideRange(range)}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${slideRange === range ? 'border-black bg-black/5' : 'border-gray-100 hover:border-gray-200 bg-gray-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${slideRange === range ? 'bg-black' : 'bg-gray-300'}`} />
                                    <span className={`font-bold ${slideRange === range ? 'text-black' : 'text-gray-600'}`}>Slides {range}</span>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">10 Slides</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5 bg-black rounded-2xl text-white text-left space-y-2 relative overflow-hidden">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">Production Features</h4>
                    <p className="text-[11px] text-gray-300 relative z-10">✨ High-quality 8k AI generated imagery per slide</p>
                    <p className="text-[11px] text-gray-300 relative z-10">🎙️ Professional "Lumo" AI narration</p>
                    <p className="text-[11px] text-gray-300 relative z-10">💡 Technical analogies & real-life examples</p>
                    <div className="absolute right-[-10%] bottom-[-10%] w-24 h-24 bg-white/5 blur-2xl rounded-full" />
                </div>

                <div className="flex gap-4 pt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 text-sm font-bold text-gray-400 hover:text-gray-600 border-2 border-gray-100 rounded-2xl transition-colors"
                    >
                        Back
                    </button>
                    <button
                        onClick={startExplainer}
                        className="flex-[2] py-4 bg-black text-white font-black rounded-2xl shadow-xl shadow-black/10 hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
                    >
                        <SparklesIcon className="w-5 h-5" />
                        Generate Video
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center backdrop-blur-md">
            {draft && stage !== 'error' && stage !== 'idle' ? (
                <div className="fixed inset-0 bg-black z-[60]">
                    <LivePlayer
                        draft={draft}
                        onClose={onClose}
                        startOffset={parseInt(slideRange.split('-')[0], 10) - 1}
                    />
                </div>
            ) : (
                <div className="max-w-xl w-full max-h-[95vh] overflow-y-auto custom-scrollbar p-6">
                    <div className="rounded-[2rem] overflow-hidden">
                        {error ? (
                            <div className="flex-1 flex items-center justify-center p-12 text-center bg-white shadow-2xl">
                                <div className="space-y-4 max-w-md">
                                    <div className="w-20 h-20 bg-black/5 text-black rounded-full flex items-center justify-center mx-auto mb-6 border border-black/10">
                                        <XCircleIcon className="w-12 h-12" />
                                    </div>
                                    <h3 className="text-2xl font-black text-black uppercase tracking-tight">Production Halt</h3>
                                    <p className="text-gray-500 font-medium text-sm">{error}</p>
                                    <button
                                        onClick={onClose}
                                        className="mt-8 w-full py-4 bg-black text-white font-bold rounded-2xl hover:bg-gray-900 transition-all shadow-xl shadow-black/20"
                                    >
                                        Close Studio
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white shadow-2xl p-6">
                                {renderLoading()}
                                {stage === 'idle' && (
                                    <div className="pt-4 flex justify-center">
                                        <button
                                            onClick={startExplainer}
                                            className="px-8 py-3 bg-black text-white font-black rounded-xl shadow-lg hover:bg-gray-900 transition-all"
                                        >
                                            Begin Production
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VisualAIPlayer;
