import React, { useState, useEffect, useRef } from 'react';
import { ChatIcon, SendIcon, MicrophoneIcon, LumoLogo } from '../Icons';
import Button from '../common/Button';
import { sendMessageToChatbot, startChat } from '../../services/geminiService';

interface Message {
    text: string;
    sender: 'user' | 'bot';
}

const Chatbot: React.FC<{ userName?: string }> = ({ userName }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [tab, setTab] = useState<'ai'|'class'>('ai');
    const [recording, setRecording] = useState(false);
    const [classMsgs, setClassMsgs] = useState<Array<{text:string; sender:string; mentions:string[]; time:number}>>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        startChat();
        setMessages([
            { sender: 'bot', text: "Hello! I'm Lumo, your AI study assistant. How can I help you today?" }
        ]);
    }, []);

    // Open/close WebSocket for Class Chat
    useEffect(() => {
        if (tab !== 'class') { return; }
        let closed = false;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.hostname;
        const candidatePorts = [8765, 8766, 8767, 8768, 8769];
        let current: WebSocket | null = null;
        const tryConnect = (idx: number) => {
            if (closed || idx >= candidatePorts.length) return;
            const url = `${protocol}://${host}:${candidatePorts[idx]}/ws/class`;
            const ws = new WebSocket(url);
            current = ws;
            wsRef.current = ws;
            let triedNext = false;
            ws.onopen = () => { /* connected */ };
            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg?.type === 'class_message') {
                        setClassMsgs(prev => [...prev, { text: msg.text, sender: msg.sender, mentions: msg.mentions||[], time: msg.time||Date.now() }]);
                    }
                } catch {}
            };

            ws.onerror = () => {
                if (!triedNext) { triedNext = true; tryConnect(idx + 1); }
            };
            ws.onclose = () => {
                if (!triedNext) { triedNext = true; tryConnect(idx + 1); }
                if (wsRef.current === ws) wsRef.current = null;
            };
        };
        tryConnect(0);
        return () => { closed = true; try { current?.close(); } catch {} };
    }, [tab]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: Message = { text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const botResponse = await sendMessageToChatbot(input);
            const botMessage: Message = { text: botResponse, sender: 'bot' };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            const errorMessage: Message = { text: "Sorry, I'm having trouble connecting. Please try again later.", sender: 'bot' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const renderMessage = (text: string) => {
        const renderInline = (s: string) => {
            const parts = s.split(/(\*\*[^*]+\*\*)/g);
            return parts.map((p, i) => (
                p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
            ));
        };
        const lines = text.split(/\r?\n/);
        const nodes: React.ReactNode[] = [];
        let list: string[] = [];
        const flush = () => {
            if (!list.length) return;
            nodes.push(
                <ul key={`ul-${nodes.length}`} className="list-disc pl-5 space-y-1">
                    {list.map((t, i) => (
                        <li key={i}>{renderInline(t.replace(/^\s*[*-]\s*/, ''))}</li>
                    ))}
                </ul>
            );
            list = [];
        };
        lines.forEach((line) => {
            if (/^\s*[*-]\s+/.test(line)) list.push(line);
            else {
                flush();
                if (line.trim()) nodes.push(<p key={`p-${nodes.length}`}>{renderInline(line)}</p>);
            }
        });
        flush();
        return <>{nodes}</>;
    };
    
    // Voice input via Web Speech API (fallback no-op if unavailable)
    const startVoice = () => {
        const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SR) { alert('Voice input is not supported on this browser.'); return; }
        const rec = new SR();
        rec.lang = 'en-US';
        rec.onstart = () => setRecording(true);
        rec.onerror = () => setRecording(false);
        rec.onend = () => setRecording(false);
        rec.onresult = (e: any) => {
            const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
            setInput(prev => (prev ? prev + ' ' : '') + transcript);
        };
        rec.start();
    };

    // Download PDF (with graceful fallback to .txt if jsPDF isn't installed)
    const downloadPdf = async () => {
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            doc.setFontSize(12);
            let y = 10;
            messages.forEach((m) => {
                const prefix = m.sender === 'user' ? 'You: ' : 'AI: ';
                const lines = doc.splitTextToSize(prefix + m.text, 180);
                if (y + lines.length * 6 > 280) { doc.addPage(); y = 10; }
                doc.text(lines, 10, y);
                y += lines.length * 6 + 2;
            });
            doc.save('conversation.pdf');
        } catch (e) {
            // Fallback: download plain text
            const content = messages.map(m => `${m.sender === 'user' ? 'You' : 'AI'}: ${m.text}`).join('\n\n');
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'conversation.txt';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="flex flex-col h-full p-4 md:p-8">
            <div className="flex items-center gap-4 mb-8">
                <ChatIcon className="w-8 h-8 text-muted-foreground" />
                <h1 className="text-3xl font-bold">AI Study Assistant · Live Q&A Chatbot</h1>
            </div>
            <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setTab('ai')} className={`px-3 h-9 rounded-full border text-sm ${tab==='ai'?'bg-foreground text-background':'bg-background'}`}>Ask AI</button>
                <button onClick={() => setTab('class')} className={`px-3 h-9 rounded-full border text-sm ${tab==='class'?'bg-foreground text-background':'bg-background'}`}>Class Chat</button>
                <div className="ml-auto flex items-center gap-2">
                    <Button onClick={downloadPdf} variant="secondary">Download chat</Button>
                </div>
            </div>
            <div className="flex-1 flex flex-col bg-card border border-border rounded-lg overflow-hidden">
                <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    {tab==='ai' ? messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.sender === 'bot' && (
                                <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
                                    <LumoLogo className="w-4 h-4 text-foreground/70" />
                                </div>
                            )}
                            <div className={`max-w-lg px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-foreground text-background' : 'bg-background'}`}>
                                <div className="text-sm break-words">{renderMessage(msg.text)}</div>
                            </div>
                        </div>
                    )) : (
                        <div className="space-y-3">
                            {classMsgs.map((m,i)=>{
                                const me = (userName || 'Student');
                                const mentioned = (m.mentions||[]).some(x => x.toLowerCase()===me.toLowerCase());
                                return (
                                    <div key={i} className={`flex items-start gap-3 ${m.sender===me?'justify-end':'justify-start'}`}>
                                        <div className={`max-w-lg px-4 py-2 rounded-lg ${m.sender===me?'bg-foreground text-background':'bg-background'} ${mentioned && m.sender!==me ? 'ring-2 ring-amber-400' : ''}`}>
                                            <p className="text-xs font-medium mb-1">{m.sender}</p>
                                            <div className="text-sm break-words">{renderMessage(m.text)}</div>
                                        </div>
                                    </div>
                                );
                            })}
                            {classMsgs.length===0 && <div className="text-sm text-muted-foreground">No messages yet. Start the conversation!</div>}
                        </div>
                    )}
                    {isLoading && (
                        <div className="flex items-start gap-3 justify-start">
                             <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0"><LumoLogo className="w-4 h-4 text-foreground/70"/></div>
                             <div className="max-w-lg px-4 py-2 rounded-lg bg-background">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 bg-muted rounded-full animate-pulse delay-75"></span>
                                    <span className="w-2 h-2 bg-muted rounded-full animate-pulse delay-150"></span>
                                    <span className="w-2 h-2 bg-muted rounded-full animate-pulse delay-300"></span>
                                </div>
                            </div>
                        </div>
                    )}
                     <div ref={messagesEndRef} />
                </div>
                <div className="border-t border-border p-4 bg-background">
                    <div className="flex items-center gap-4">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isLoading) {
                                    if (tab==='ai') { handleSend(); }
                                    else {
                                        const ws = wsRef.current;
                                        if (ws && ws.readyState===1 && input.trim()) {
                                            const me = (userName || 'Student');
                                            ws.send(JSON.stringify({ text: input.trim(), sender: me }));
                                            setInput('');
                                        }
                                    }
                                }
                            }}
                            placeholder="Ask a question about your studies..."
                            className="w-full p-2 bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-foreground"
                            disabled={isLoading}
                        />
                        <button onClick={startVoice} aria-label="Start voice input" title="Voice input" className={`w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center ${recording? 'animate-pulse':''}`}>
                            <MicrophoneIcon className="w-4 h-4" />
                        </button>
                        {tab==='ai' ? (
                            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                                <SendIcon className="w-5 h-5" />
                            </Button>
                        ) : (
                            <Button onClick={() => { const ws = wsRef.current; const me = (userName || 'Student'); if (ws && ws.readyState===1 && input.trim()) { ws.send(JSON.stringify({ text: input.trim(), sender: me })); setInput(''); } }} disabled={!input.trim()}>
                                <SendIcon className="w-5 h-5" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chatbot;
