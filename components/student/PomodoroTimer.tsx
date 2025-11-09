import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Button from '../common/Button';
import type { Course } from '../../types';

interface Props {
  courses?: Course[];
  enrolledCourseIds?: string[];
}

type Phase = 'focus' | 'short' | 'long';

const PomodoroTimer: React.FC<Props> = ({ courses = [], enrolledCourseIds = [] }) => {
  const STORAGE_KEY = 'pomodoro_state_v1';
  const DEFAULT_DURATIONS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 } as const;
  const savedInit = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  })() as { phase?: Phase; endAt?: number|null } | null;

  const initPhase: Phase = savedInit?.phase ?? 'focus';
  const initEndAt: number | null = savedInit?.endAt && savedInit.endAt > Date.now() ? savedInit.endAt : null;

  const [phase, setPhase] = useState<Phase>(initPhase);
  const [running, setRunning] = useState<boolean>(!!initEndAt);
  const [endAt, setEndAt] = useState<number | null>(initEndAt);
  const [remaining, setRemaining] = useState<number>(initEndAt ? Math.max(0, Math.floor((initEndAt - Date.now()) / 1000)) : DEFAULT_DURATIONS[initPhase]);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [sound, setSound] = useState(true);
  const [blink, setBlink] = useState(true);
  const [technique, setTechnique] = useState<'pomodoro'|'feynman'>('pomodoro');

  const durations = useMemo(() => ({ focus: 25 * 60, short: 5 * 60, long: 15 * 60 }), []);
  const myCourses = useMemo(() => (courses || []).filter(c => (enrolledCourseIds || []).includes(c.id)), [courses, enrolledCourseIds]);
  const [selCourseId, setSelCourseId] = useState<string>(myCourses[0]?.id || '');
  const [notes, setNotes] = useState<string>('');

  const targetFor = useCallback((p: Phase) => Date.now() + (durations[p] * 1000), [durations]);

  const setPhaseAndReset = useCallback((p: Phase) => {
    setPhase(p);
    setRemaining(durations[p]);
    setEndAt(null);
    setRunning(false);
  }, [durations]);

  // Restore state on mount so the timer keeps running across navigation
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { phase: Phase; endAt: number | null; running?: boolean; timeSaved?: number; };
      if (!saved) return;
      setPhase(saved.phase ?? 'focus');
      if (saved.endAt && saved.endAt > Date.now()) {
        setEndAt(saved.endAt);
        setRunning(true);
        setRemaining(Math.max(0, Math.floor((saved.endAt - Date.now()) / 1000)));
      } else {
        setRunning(false);
        setEndAt(null);
        setRemaining(durations[saved.phase ?? 'focus']);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blink the colon every 500ms
  useEffect(() => {
    const id = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!running) return;
    if (!endAt) setEndAt(targetFor(phase));
    let raf: number;
    const tick = () => {
      const now = Date.now();
      const eta = Math.max(0, Math.floor(((endAt || now) - now) / 1000));
      setRemaining(eta);
      if (eta <= 0) {
        setRunning(false);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, endAt, phase, targetFor]);

  // Persist state whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, endAt, running, timeSaved: Date.now() }));
    } catch {}
  }, [phase, endAt, running]);

  // Also persist remaining occasionally for extra robustness
  useEffect(() => {
    const id = setInterval(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, endAt, running, timeSaved: Date.now() })); } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [phase, endAt, running]);

  // Persist on unmount as a safety
  useEffect(() => {
    return () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, endAt, running, timeSaved: Date.now() })); } catch {}
    };
  }, [phase, endAt, running]);

  // When coming back to the tab/view, resync remaining from endAt
  useEffect(() => {
    const syncFromEnd = () => {
      if (running && endAt) {
        setRemaining(Math.max(0, Math.floor((endAt - Date.now()) / 1000)));
      } else {
        // also attempt to restore from storage in case of remount timing
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw) as { phase: Phase; endAt: number | null; running: boolean };
            if (saved?.running && saved.endAt) {
              setPhase(saved.phase ?? 'focus');
              setEndAt(saved.endAt);
              setRunning(true);
              setRemaining(Math.max(0, Math.floor((saved.endAt - Date.now()) / 1000)));
            }
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', syncFromEnd);
    // light interval to keep remaining close even if RAF paused briefly
    const id = setInterval(syncFromEnd, 1000);
    return () => { document.removeEventListener('visibilitychange', syncFromEnd); clearInterval(id); };
  }, [running, endAt]);

  useEffect(() => {
    if (running || remaining > 0) return;
    if (sound) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        o.start(); o.stop(ctx.currentTime + 0.45);
      } catch {}
    }
    if (phase === 'focus') {
      setCompletedFocus(c => c + 1);
      const next = (completedFocus + 1) % 4 === 0 ? 'long' : 'short';
      setPhaseAndReset(next as Phase);
    } else {
      setPhaseAndReset('focus');
    }
  }, [remaining, running, phase, setPhaseAndReset, completedFocus, sound]);

  const startPause = () => {
    if (!running) {
      setEndAt(Date.now() + remaining * 1000);
      setRunning(true);
    } else {
      setRunning(false);
      setEndAt(null);
    }
  };

  const reset = () => setPhaseAndReset(phase);
  const skip = () => setRemaining(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); startPause(); }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); reset(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, remaining, phase]);

  const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
  const ss = (remaining % 60).toString().padStart(2, '0');
  const percent = 1 - remaining / durations[phase];

  const phaseLabel = phase === 'focus' ? 'Focus' : phase === 'short' ? 'Short Break' : 'Long Break';

  // Slide digit component (clean flip-clock aesthetic)
  const SlideDigit: React.FC<{ value: string }> = ({ value }) => {
    const prev = useRef(value);
    const [anim, setAnim] = useState(false);
    useEffect(() => {
      if (prev.current !== value) {
        setAnim(true);
        const t = setTimeout(() => {
          prev.current = value;
          setAnim(false);
        }, 260);
        return () => clearTimeout(t);
      }
    }, [value]);
    return (
      <div className="tile">
        <div className="stack">
          <span className={`digit ${anim ? 'up' : ''}`}>{prev.current}</span>
          <span className={`digit next ${anim ? 'in' : ''}`}>{value}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <button onClick={() => setTechnique('pomodoro')} className={`px-4 h-10 rounded-full border text-sm transition ${technique==='pomodoro' ? 'bg-foreground text-background' : 'bg-background hover:border-foreground/40'}`}>Pomodoro Timer</button>
          <button onClick={() => setTechnique('feynman')} className={`px-4 h-10 rounded-full border text-sm transition ${technique==='feynman' ? 'bg-foreground text-background' : 'bg-background hover:border-foreground/40'}`}>Feynman Technique</button>
        </div>

        {technique === 'pomodoro' ? (
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-xs px-2 py-1 rounded-full bg-background text-foreground/80 border border-border">{phaseLabel}</div>
            <div className="flex items-center gap-2 text-xs">
              <span>Sound</span>
              <button onClick={() => setSound(s => !s)} className="px-2 py-1 border border-border rounded hover:bg-accent/10">
                {sound ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="relative mx-auto">
            <div className="flex items-center gap-5 select-none">
              <SlideDigit value={mm[0]} />
              <SlideDigit value={mm[1]} />
              <div className="colon text-foreground/70 text-center" style={{ opacity: blink ? 1 : 0.1 }}>:</div>
              <SlideDigit value={ss[0]} />
              <SlideDigit value={ss[1]} />
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-lg mt-6">
            <div className="grid grid-cols-3 gap-2">
              <button className={`h-10 rounded border text-sm ${phase==='focus'?'bg-foreground text-background':'bg-background border-border'}`} onClick={() => setPhaseAndReset('focus')}>Focus</button>
              <button className={`h-10 rounded border text-sm ${phase==='short'?'bg-foreground text-background':'bg-background border-border'}`} onClick={() => setPhaseAndReset('short')}>Short</button>
              <button className={`h-10 rounded border text-sm ${phase==='long'?'bg-foreground text-background':'bg-background border-border'}`} onClick={() => setPhaseAndReset('long')}>Long</button>
            </div>

            <div className="flex gap-2">
              <Button onClick={startPause} variant="primary" className="flex-1 h-11">{running ? 'Pause' : 'Start'}</Button>
              <Button onClick={reset} variant="secondary" className="h-11 px-4">Reset</Button>
              <Button onClick={skip} variant="secondary" className="h-11 px-4">Skip</Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              Space: Start/Pause · R: Reset · S: Skip · Cycles: {completedFocus}
            </div>
          </div>

          <div className="w-full max-w-lg mt-6 text-sm text-muted-foreground text-center">
            • Improves focus • Prevents burnout • Builds consistency
          </div>
        </div>
        ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-lg border border-border bg-background p-6">
            {myCourses.length ? (
              <>
                <label className="block text-sm mb-1">Select Course</label>
                <select className="w-full p-2 mb-3 bg-background border border-border rounded-md" value={selCourseId} onChange={(e) => setSelCourseId(e.target.value)}>
                  {myCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                <textarea
                  className="w-full h-64 p-3 bg-white text-black rounded-md border border-border"
                  placeholder="Explain the concept in simple words, as if teaching someone else..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Enroll in a course to use the Feynman technique here.</p>
            )}
          </div>
        </div>
        )}
      </div>
      <style>{`
        /* Responsive flip tiles using CSS vars so they fit without zoom */
        :root{--tile-w:clamp(96px,12vw,156px);--tile-h:calc(var(--tile-w)*1.18);--digit-size:clamp(64px,8vw,104px)}
        .tile{position:relative;width:var(--tile-w);height:var(--tile-h);border-radius:14px;background:linear-gradient(180deg,#fff 0%,#f7f7f7 100%);border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 24px rgba(0,0,0,.08);overflow:hidden}
        .stack{position:relative;width:100%;height:100%}
        .digit{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#0a0a0a;font-weight:600;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-variant-numeric: tabular-nums;letter-spacing:1px;font-size:var(--digit-size);line-height:1;transform:translateY(0);transition:transform .22s ease}
        .digit.up{transform:translateY(-100%)}
        .digit.next{transform:translateY(100%)}
        .digit.next.in{transform:translateY(0)}
        .colon{width:clamp(18px,2.2vw,28px);font-size:clamp(48px,6vw,96px);line-height:1}
      `}</style>
    </div>
  );
};

export default PomodoroTimer;