import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { PdfExplainerIcon, VideoIcon, SpeakerIcon, CheckCircleIcon, PlayIcon, XCircleIcon } from '../Icons';
import type { VideoDraft } from '../../types';
import { exportLectureToWebM } from '../../services/videoExporter';

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
  { id: 'rendering', title: 'Assemble Preview', description: 'Combining slides, audio, and highlights.' },
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

  const acceptFile = useCallback((selected: File | null) => {
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      setFile(null);
      return;
    }
    setFile(selected);
    setError('');
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

    try {
      const maybeKey = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('GEMINI_API_KEY') : null;
      const headers: Record<string, string> = {};
      if (maybeKey) headers['x-api-key'] = String(maybeKey);
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
  }, [file, startPolling]);

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
      const blob = await exportLectureToWebM(draft, { width: 1280, height: 720, fps: 30, defaultSlideDurationMs: 6000 });
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
  }, [draft, isExporting]);

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
            <label htmlFor="pdf-upload" className="inline-flex">
              <Button variant="secondary" disabled={!canStart}>
                Choose PDF
              </Button>
            </label>
            {file && (
              <p className="mt-3 text-sm text-foreground/80">
                Selected: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={handleUpload} disabled={!file || !canStart}>
              Generate Explainer
            </Button>
            {(stage === 'uploading' || stage === 'analyzing' || stage === 'drafting' || stage === 'narrating' || stage === 'rendering') && (
              <span className="text-sm text-muted-foreground">Working on it… hang tight!</span>
            )}
            {canStart && jobId && (
              <Button variant="secondary" onClick={reset}>
                Reset
              </Button>
            )}
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
            <VideoIcon className="w-5 h-5" /> Preview
          </h2>
          {draft ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleGeneratePreview} disabled={!draft || isExporting}>
                  {previewUrl ? (isExporting ? 'Updating preview…' : 'Regenerate Preview') : isExporting ? 'Generating preview…' : 'Generate Preview'}
                </Button>
                <Button variant="secondary" onClick={handleDownload} disabled={!previewUrl || isExporting}>
                  Download Video
                </Button>
                {exportError && <span className="text-sm text-red-500">{exportError}</span>}
              </div>
              {isExporting && <p className="text-sm text-muted-foreground">Rendering preview… this can take up to a minute for long lectures.</p>}
              {previewUrl && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Preview ready. Watch below or download the narrated video.</p>
                  <div className="flex flex-col gap-2">
                    <video key={previewUrl} controls src={previewUrl} className="w-full rounded-md border border-border" />
                    <Button variant="secondary" onClick={() => setIsPreviewOpen(true)} className="inline-flex items-center gap-2 w-max">
                      <PlayIcon className="w-4 h-4" />
                      Open Larger Preview
                    </Button>
                  </div>
                </div>
              )}
              {!previewUrl && !isExporting && (
                <p className="text-sm text-muted-foreground">Generate a preview to watch the narrated slides before downloading.</p>
              )}
              <div>
                <p className="text-lg font-semibold">{draft.title}</p>
                <p className="text-sm text-muted-foreground">{draft.summary}</p>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {draft.slides.map((slide, index) => (
                  <div key={index} className="border border-border rounded-md p-3 bg-background space-y-2">
                    <p className="text-sm font-semibold">Slide {index + 1}</p>
                    <p className="text-sm text-foreground/90">{slide.description}</p>
                    <audio controls preload="none" className="w-full">
                      <source src={slide.audioUrl} type="audio/mpeg" />
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Upload a PDF and generate an explainer to preview the narrated slides.</p>
            </div>
          )}
        </aside>
      </div>

      {isPreviewOpen && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl">
            <button
              type="button"
              onClick={closePreview}
              className="absolute top-3 right-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <XCircleIcon className="w-5 h-5" />
              Close
            </button>
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <VideoIcon className="w-5 h-5" />
                {draft?.title || 'Explainer Preview'}
              </h3>
              <video src={previewUrl} controls autoPlay className="w-full rounded-md border border-border" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfExplainer;
