import React, { useEffect, useRef, useState } from 'react';
import { User, Role } from '../types';
import { register as apiRegister, login as apiLogin } from '../services/authService';
import Button from './common/Button';
import { LumoLogo } from './Icons';

interface AuthProps {
    onLogin: (user: User) => void;
    onShowAdminConsole: () => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin, onShowAdminConsole }) => {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setError(null);
        setLoading(true);
        try {
            if (mode === 'register') {
                const { user } = await apiRegister({ name, email, password, role: Role.Student });
                onLogin(user);
            } else {
                const { user } = await apiLogin({ email, password });
                onLogin(user);
            }
        } catch (e: any) {
            setError(e?.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    // Matrix rain canvas background (stable, no reloads)
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let raf = 0;
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const fontSize = 16;
        const color = 'rgba(0,0,0,0.35)';
        const bgFade = 'rgba(255,255,255,0.08)';
        const setSize = () => {
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        setSize();
        window.addEventListener('resize', setSize);
        // columns for the rain
        const cols = Math.ceil(window.innerWidth / fontSize);
        const drops = Array(cols).fill(0).map(() => Math.floor(Math.random() * -20));
        const draw = () => {
            // slight white overlay for trail fade
            ctx.fillStyle = bgFade;
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            ctx.fillStyle = color;
            ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
            for (let i = 0; i < drops.length; i++) {
                const x = i * fontSize;
                const y = drops[i] * fontSize;
                const char = Math.random() > 0.5 ? '1' : '0';
                ctx.fillText(char, x, y);
                // reset drop with random threshold so it keeps flowing
                if (y > window.innerHeight && Math.random() > 0.975) drops[i] = Math.floor(Math.random() * -20);
                drops[i]++;
            }
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', setSize);
        };
    }, []);

    return (
        <div className="relative min-h-screen">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
            <div className="relative z-10 min-h-screen grid md:grid-cols-2 bg-gradient-to-br from-foreground/5 via-background to-background">
            {/* Left: Hero */}
            <div className="hidden md:flex items-center justify-center p-10">
                <div className="max-w-md relative">
                    <div className="flex items-center gap-3 mb-6">
                        <LumoLogo className="w-12 h-12 text-foreground" />
                        <h1 className="text-4xl font-extrabold tracking-tight">LumoAI</h1>
                    </div>
                    <p className="text-lg text-muted-foreground mb-6">Your AI-powered learning companion.</p>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                        <li>• Live Q&A Chatbot with voice and export</li>
                        <li>• Class Chat for collaboration</li>
                        <li>• Study Tools: Pomodoro and more</li>
                    </ul>
                </div>
            </div>

            {/* Right: Auth Card */}
            <div className="flex items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-sm p-6 md:p-8">
                    <div className="mb-6">
                        <div className="flex md:hidden items-center gap-2 mb-2">
                            <LumoLogo className="w-8 h-8 text-foreground" />
                            <h2 className="text-2xl font-bold">LumoAI</h2>
                        </div>
                        <div className="inline-flex bg-background border border-border rounded-full overflow-hidden">
                            <button onClick={() => setMode('login')} className={`px-4 py-2 text-sm ${mode==='login' ? 'bg-foreground text-background' : ''}`}>Login</button>
                            <button onClick={() => setMode('register')} className={`px-4 py-2 text-sm ${mode==='register' ? 'bg-foreground text-background' : ''}`}>Register</button>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                        {mode === 'register' && (
                            <input type="text" placeholder="Full name" value={name} onChange={(e)=>setName(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded" />
                        )}
                        <input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded" />
                        <div className="relative">
                            <input type={showPassword? 'text':'password'} placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded pr-20" />
                            <button type="button" onClick={()=>setShowPassword(s=>!s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 border border-border rounded bg-background">{showPassword? 'Hide':'Show'}</button>
                        </div>

                        {mode === 'register' && (
                            <div className="text-xs text-muted-foreground">
                                New accounts are student-only. Teacher accounts are created by the admin.
                            </div>
                        )}

                        {mode === 'login' && (
                            <div className="flex items-center justify-between text-sm">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e)=>setRemember(e.target.checked)} /> Remember me</label>
                            </div>
                        )}

                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                        <Button onClick={handleSubmit} className="w-full h-11" disabled={loading || (mode==='register' && (!name||!email||!password)) || (mode==='login' && (!email||!password))}>
                            {loading ? 'Please wait...' : mode==='register' ? 'Create account' : 'Login'}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">By continuing, you agree to the Terms and Privacy Policy.</p>
                        <button
                            type="button"
                            onClick={onShowAdminConsole}
                            className="w-full text-xs text-center text-foreground/80 hover:underline"
                        >
                            Admin console
                        </button>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};

export default Auth;
