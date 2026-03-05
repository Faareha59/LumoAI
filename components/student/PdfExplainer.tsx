import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { PdfExplainerIcon, VideoIcon, SpeakerIcon, CheckCircleIcon, PlayIcon, XCircleIcon } from '../Icons';
import type { VideoDraft, Slide } from '../../types';
import { exportLectureToWebM, drawSlide, getThemeStyle } from '../../services/videoExporter';
import * as pdfjsLib from 'pdfjs-dist';
import LivePlayer from './LivePlayer';

// Use a reliable fixed version for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

type PipelineStage = 'idle' | 'uploading' | 'analyzing' | 'drafting' | 'narrating' | 'rendering' | 'done' | 'error';

interface StatusResponse {
  status: PipelineStage;
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
  draft?: VideoDraft;
  error?: string;
}

interface StepConfig {
  id: PipelineStage;
  title: string;
  description: string;
}

const PIPELINE_STEPS: StepConfig[] = [
  { id: 'analyzing', title: 'Analyze PDF', description: 'Extracting key points and structure.' },
  { id: 'drafting', title: 'Draft Slides', description: 'Creating short explanations per slide.' },
  { id: 'narrating', title: 'Generate Narration', description: 'Producing voiceover script audio.' },
  { id: 'done', title: 'Ready to Play', description: 'Cinematic explainer is ready!' },
];

const PdfExplainer: React.FC = () => {
  const API_BASE = (typeof window !== 'undefined' && String(window.location?.origin || '').startsWith('file:')) ? 'http://localhost:8765' : '';
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [draft, setDraft] = useState<VideoDraft | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLivePlaying, setIsLivePlaying] = useState(false);
  const [slideRange, setSlideRange] = useState('1-30');
  const hasAutoStarted = useRef(false);

  const reset = useCallback(() => {
    setJobId(null);
    setStage('idle');
    setStatusMessage('');
    setError('');
    setDraft(null);
    setProgress(null);
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsDragging(false);
    setIsExporting(false);
    setExportError('');
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setIsPreviewOpen(false);
    hasAutoStarted.current = false;
  }, []);

  useEffect(() => () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Auto-start Live Player when first slides are ready
  useEffect(() => {
    if (draft && draft.slides.length >= 2 && !hasAutoStarted.current && stage !== 'done' && stage !== 'error') {
      console.log('[Live] Auto-starting production mode');
      hasAutoStarted.current = true;
      setIsLivePlaying(true);
    }
  }, [draft?.slides.length, stage]);

  const acceptFile = useCallback((selected: File | null) => {
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      setFile(null);
      return;
    }
    setFile(selected);
    setError('');
    hasAutoStarted.current = false; // Reset for new upload
  }, []);

  const startPolling = useCallback((id: string) => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/pdf-explainer/status?jobId=${encodeURIComponent(id)}`);
        if (!res.ok) {
          throw new Error('Failed to fetch job status.');
        }
        const data: StatusResponse = await res.json();
        setStage(data.status);
        if (data.message) {
          setStatusMessage(data.message);
        }
        if (data.draft) {
          setDraft(data.draft);
        }
        if (data.progress) {
          setProgress(data.progress);
        } else {
          setProgress(null);
        }
        if (data.status === 'done') {
          if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
        if (data.status === 'error' && data.error) {
          setError(data.error);
          if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (err) {
        console.error(err);
        setStage('error');
        setError('Unable to track progress. Please retry.');
        if (pollRef.current !== null) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 2500);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setError('');
    setStatusMessage('');
    setStage('uploading');
    setProgress(null);
    setExportError('');
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setIsPreviewOpen(false);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('slideRange', slideRange);

    try {
      const headers: Record<string, string> = {};
      const maybeGroq = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('GROQ_API_KEY') : null;
      if (maybeGroq) headers['x-groq-key'] = String(maybeGroq);
      const res = await fetch(`${API_BASE}/api/pdf-explainer/start`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        let serverMsg = '';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const body = await res.json();
            serverMsg = String(body?.error || body?.message || '');
          } else {
            serverMsg = (await res.text())?.slice(0, 300);
          }
        } catch {
          // ignore parse errors
        }
        const reason = serverMsg || `HTTP ${res.status} ${res.statusText}`;
        throw new Error(`Failed to start PDF explainer job: ${reason}`);
      }

      const data: { jobId: string; status?: PipelineStage; message?: string } = await res.json();
      setJobId(data.jobId);
      setStage(data.status && data.status !== 'idle' ? data.status : 'analyzing');
      if (data.message) {
        setStatusMessage(data.message);
      }
      startPolling(data.jobId);
    } catch (err) {
      console.error('PDF explainer start failed:', err);
      setStage('error');
      setError(err instanceof Error ? err.message : 'Upload failed. Please check your PDF and try again.');
    }
  }, [file, startPolling, slideRange]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    acceptFile(event.target.files[0]);
  }, [acceptFile]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) {
      acceptFile(dropped[0]);
    }
  }, [acceptFile]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }, [isDragging]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const canStart = useMemo(() => stage === 'idle' || stage === 'error' || stage === 'done', [stage]);

  const handleGeneratePreview = useCallback(async () => {
    if (!draft || isExporting) return;
    try {
      setExportError('');
      setIsExporting(true);
      const startOffsetValue = parseInt(slideRange.split('-')[0], 10) - 1;
      const blob = await exportLectureToWebM(draft, {
        width: 1280,
        height: 720,
        fps: 30,
        defaultSlideDurationMs: 6000,
        startOffset: startOffsetValue
      });
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setIsPreviewOpen(true);
    } catch (err) {
      console.error(err);
      setExportError('Failed to export video. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [draft, isExporting, slideRange]);

  const handleDownload = useCallback(() => {
    if (!previewUrlRef.current || !draft) return;
    const link = document.createElement('a');
    link.href = previewUrlRef.current;
    link.download = `${draft.title.replace(/[^a-z0-9\-\_]+/gi, '_') || 'lumo_explainer'}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [draft]);

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <header className="flex items-center gap-4">
        <PdfExplainerIcon className="w-10 h-10 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">PDF Explainer</h1>
          <p className="text-muted-foreground">Upload a course PDF and let Lumo build narrated study slides.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div
            className={`border border-dashed border-border rounded-lg p-6 text-center transition-colors ${isDragging ? 'bg-foreground/5 border-foreground' : 'bg-background/80'}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <p className="text-base font-medium mb-2">Drop your PDF here</p>
            <p className="text-sm text-muted-foreground mb-4">Max 20 MB · Text-based PDFs work best</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="pdf-upload"
              disabled={!canStart}
            />
            <div className="hidden">
              <select
                id="slide-range"
                value={slideRange}
                onChange={(e) => setSlideRange(e.target.value)}
              >
                <option value="1-30">Full Coverage</option>
              </select>
            </div>
            <Button
              variant="secondary"
              disabled={!canStart}
              onClick={() => document.getElementById('pdf-upload')?.click()}
            >
              Choose PDF
            </Button>
            {file && (
              <p className="mt-3 text-sm text-foreground/80">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
            <div className="flex flex-col gap-4">
              <Button
                onClick={handleUpload}
                disabled={!file || !canStart}
                className="w-full py-4 text-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 transition-all duration-300 shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                <PdfExplainerIcon className="w-6 h-6" />
                Generate Video
              </Button>

              {(stage === 'uploading' || stage === 'analyzing' || stage === 'drafting' || stage === 'narrating' || stage === 'rendering') && (
                <div className="flex items-center justify-center p-3 bg-foreground/5 rounded-lg border border-border animate-pulse">
                  <span className="text-sm font-medium text-foreground">Working on it… hang tight!</span>
                </div>
              )}

              {canStart && jobId && (
                <Button variant="secondary" onClick={reset} className="w-full">
                  Reset & Start New
                </Button>
              )}
            </div>
          </div>

          {statusMessage && (
            <div className="text-sm text-muted-foreground bg-background border border-border rounded-md px-3 py-2">
              {statusMessage}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Progress</h2>
            <ol className="space-y-3">
              {PIPELINE_STEPS.map((step, idx) => {
                const currentIndex = PIPELINE_STEPS.findIndex((s) => s.id === stage);
                const stepIndex = PIPELINE_STEPS.findIndex((s) => s.id === step.id);
                const isCompleted = currentIndex > stepIndex || stage === 'done';
                const isActive = step.id === stage;
                return (
                  <li key={step.id} className="flex items-start gap-3">
                    <span className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${isCompleted ? 'bg-foreground text-background border-foreground' : isActive ? 'bg-foreground/10 text-foreground border-foreground/40' : 'bg-background text-muted-foreground border-border'}`}>
                      {isCompleted ? <CheckCircleIcon className="w-4 h-4" /> : idx + 1}
                    </span>
                    <div>
                      <p className="font-medium">{step.title}</p>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {stage === 'uploading' && <Loader text="Uploading your PDF…" />}
            {stage === 'narrating' && progress && (
              <div className="text-sm text-muted-foreground">
                Narrating slide {progress.current} of {progress.total}
              </div>
            )}
          </div>
        </section>

        <aside className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <VideoIcon className="w-5 h-5" /> Preview & Export
          </h2>

          {draft ? (
            <div className="space-y-4">
              {/* Embedded Live Player */}
              <LivePlayer
                draft={draft}
                onClose={() => { }}
                startOffset={parseInt(slideRange.split('-')[0], 10) - 1}
              />

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-xs text-indigo-900 flex gap-3 shadow-sm">
                <div className="flex-shrink-0 text-lg">💡</div>
                <div>
                  <p className="font-bold mb-1">Live AI Production Mode</p>
                  <p className="opacity-80">
                    The player above is your <strong>Live Studio</strong>. Use the expand icon to go full-screen.
                    When you are happy with the lecture, click below to render the final downloadable version.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  onClick={handleGeneratePreview}
                  disabled={!draft || isExporting}
                  className="bg-indigo-600 hover:bg-indigo-700 shadow-md flex-1 md:flex-none"
                >
                  {isExporting ? 'Rendering Final Video...' : previewUrl ? 'Regenerate Final Video' : 'Generate Downloadable Video'}
                </Button>
                {previewUrl && (
                  <Button variant="secondary" onClick={handleDownload} className="flex-1 md:flex-none">
                    Download MP4
                  </Button>
                )}
              </div>

              {exportError && <p className="text-xs text-red-500 mt-2">{exportError}</p>}

              <hr className="border-border opacity-50" />

              <div>
                <p className="text-lg font-bold text-foreground/90">{draft.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed italic mt-1">{draft.summary}</p>
              </div>

              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar border-t border-border pt-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Lecture Segments</p>
                {draft.slides.map((slide, index) => slide && (
                  <div key={index} className="border border-border rounded-xl p-3 bg-muted/30 flex gap-4 transition-all hover:bg-muted/50 group">
                    {slide.imageUrl && (
                      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 ring-1 ring-black/5 shadow-sm">
                        <img src={slide.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold text-indigo-500 uppercase">Topic {index + 1}</p>
                      <p className="text-xs text-foreground/80 leading-snug line-clamp-2">{slide.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20 px-10 text-center border-2 border-dashed border-border rounded-xl bg-muted/20">
              <VideoIcon className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">Upload a PDF to start the AI Studio</p>
              <p className="text-xs opacity-60 mt-2">Your cinematic explainer will appear here instantly as topics are generated.</p>
            </div>
          )}
        </aside>
      </div>

      {isPreviewOpen && previewUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 md:p-10">
          <div className="relative w-full max-w-5xl bg-slate-900 border border-white/10 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
                Final Render Complete
              </h3>
              <button onClick={closePreview} className="text-white/60 hover:text-white transition-colors">
                <XCircleIcon className="w-8 h-8" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="aspect-video w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <video src={previewUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
              </div>
              <div className="flex justify-end gap-4">
                <Button onClick={handleDownload} className="bg-indigo-600 hover:bg-indigo-700 px-8 py-6 text-lg font-bold rounded-2xl">Download & Save Lecture</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfExplainer;
