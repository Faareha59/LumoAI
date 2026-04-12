import React, { useState, useEffect } from 'react';
import { SkillSwap as SkillSwapType } from '../../types';
import { SparklesIcon, SearchIcon, FilterIcon, ClockIcon, UserIcon, BoltIcon, StarIcon, SendIcon, VideoIcon, ChatIcon } from '../Icons';
import { getToken } from '../../services/authService';

const Marketplace: React.FC<{ 
    user: any,
    onStartMeeting?: (roomId: string) => void 
}> = ({ user, onStartMeeting }) => {
    const [view, setView] = useState<'browse' | 'posted' | 'working'>('browse');
    const [swaps, setSwaps] = useState<SkillSwapType[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Form state
    const [newSeeking, setNewSeeking] = useState('');
    const [newOffering, setNewOffering] = useState('');
    const [newDesc, setNewDesc] = useState('');

    const [submissionText, setSubmissionText] = useState('');
    const [selectedSwap, setSelectedSwap] = useState<SkillSwapType | null>(null);
    
    // Edit state
    const [editingSwapId, setEditingSwapId] = useState<string | null>(null);
    const [editSeeking, setEditSeeking] = useState('');
    const [editOffering, setEditOffering] = useState('');
    const [editDesc, setEditDesc] = useState('');

    // Collaboration state
    const [msgText, setMsgText] = useState('');
    const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

    useEffect(() => {
        if (view === 'browse') fetchSwaps();
        if (view === 'posted' || view === 'working') fetchMySwaps();
    }, [view]);

    const fetchSwaps = async () => {
        try {
            const res = await fetch('/api/marketplace/jobs');
            const data = await res.json();
            setSwaps(data.jobs || []);
        } catch (e) { console.error(e); }
    };

    const fetchMySwaps = async () => {
        try {
            const token = getToken();
            const res = await fetch('/api/marketplace/my-jobs', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (view === 'posted') setSwaps(data.posted || []);
            else setSwaps(data.working || []);
        } catch (e) { console.error(e); }
    };

    const handlePostSwap = async () => {
        if (!newSeeking || !newOffering || !newDesc) return alert('Please fill all fields');
        try {
            const token = getToken();
            const res = await fetch('/api/marketplace/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    title: newSeeking, 
                    offering: newOffering, 
                    description: newDesc 
                })
            });
            if (res.ok) {
                alert('Skill Swap posted successfully!');
                setNewSeeking('');
                setNewOffering('');
                setNewDesc('');
                setView('posted');
            } else {
                alert('Failed to post swap');
            }
        } catch (e) { console.error(e); }
    };

    const handleAccept = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/accept`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                alert('Swap Agreement Initiated! Go to "My Collaborations" to begin learning.');
                fetchSwaps();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to initiate swap');
            }
        } catch (e) { console.error(e); }
    };

    const handleSubmit = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ submissionText })
            });
            const data = await res.json();
            if (data.success) {
                if (data.verdict.approved) {
                    alert(`Skill Verification Approved by AI!\nScore: ${data.verdict.score}\nReason: ${data.verdict.reason}`);
                } else {
                    alert(`Skill Verification REJECTED/FLAGGED by AI.\nScore: ${data.verdict.score}\nReason: ${data.verdict.reason}`);
                }
                setSubmissionText('');
                setSelectedSwap(null);
                fetchMySwaps();
            } else {
                alert('Submission failed');
            }
        } catch (e) { console.error(e); }
    };

    const handleUncollaborate = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/uncollaborate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                alert('Collaboration cancelled successfully!');
                fetchMySwaps();
            } else {
                alert('Failed to cancel collaboration');
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this listing?')) return;
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                fetchMySwaps();
            }
        } catch (e) { console.error(e); }
    };

    const startEditing = (swap: SkillSwapType) => {
        setEditingSwapId(swap._id);
        setEditSeeking(swap.title);
        setEditOffering(swap.offering);
        setEditDesc(swap.description);
    };

    const handleUpdate = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    title: editSeeking, 
                    offering: editOffering, 
                    description: editDesc 
                })
            });
            if (res.ok) {
                setEditingSwapId(null);
                fetchMySwaps();
            }
        } catch (e) { console.error(e); }
    };

    const handleSendMessage = async (id: string) => {
        if (!msgText.trim()) return;
        const currentMsg = msgText;
        setMsgText(''); // Clear early for better UX
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ text: currentMsg })
            });
            if (res.ok) {
                fetchMySwaps();
            } else {
                setMsgText(currentMsg); // Restore on error
                alert('Failed to send message');
            }
        } catch (e) { 
            setMsgText(currentMsg);
            console.error(e); 
        }
    };

    const handleComplete = async (id: string) => {
        if (!confirm('Are you sure you want to mark this Skill Swap as Complete? This will finalize the learning agreement.')) return;
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/complete`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                alert('Agreement Marked as Complete! Well done.');
                fetchMySwaps();
            } else {
                alert('Failed to complete swap');
            }
        } catch (e) { console.error(e); }
    };

    const handleUpdatePlan = async (id: string, plan: string) => {
        setIsUpdatingPlan(true);
        try {
            const token = getToken();
            const res = await fetch(`/api/marketplace/jobs/${id}/plan`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ plan })
            });
            if (res.ok) {
                // Optionally show success or just let re-fetch handle it
                fetchMySwaps();
            }
        } catch (e) { console.error(e); }
        finally { setIsUpdatingPlan(false); }
    };

    const startMeeting = (id: string) => {
        const roomName = `LumoSwap-${id}`;
        if (onStartMeeting) {
            onStartMeeting(roomName);
        } else {
            // Fallback for standalone use
            window.open(`https://meet.jit.si/${roomName}`, '_blank');
        }
    };

    const filteredSwaps = swaps.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.offering.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
            {/* Premium Header */}
            <header className="bg-white/80 backdrop-blur-2xl border-b border-black/10 px-8 py-6 sticky top-0 z-50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-6 flex-1 w-full max-w-3xl">
                        <div className="relative flex-1 group">
                            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-black transition-colors" />
                            <input
                                type="text"
                                placeholder="Search for skills to learn or trade..."
                                className="w-full pl-14 pr-6 py-4 bg-gray-50/50 border-2 border-transparent rounded-[2rem] text-black placeholder:text-gray-400 focus:bg-white focus:border-black/30 focus:ring-4 focus:ring-black/5 transition-all font-semibold text-base shadow-inner"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center text-white shadow-xl shadow-black/10 hover:rotate-6 transition-transform cursor-pointer">
                            <UserIcon className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            </header>

            {/* View Switcher */}
            <div className="bg-slate-50/30 backdrop-blur-md border-b border-slate-200 px-8 py-1">
                <div className="max-w-7xl mx-auto flex gap-10">
                    {[
                        { id: 'browse', label: 'Skill Swap Arena', icon: SearchIcon },
                        { id: 'working', label: 'My Learning Agreements', icon: BoltIcon },
                        { id: 'posted', label: 'My Trade Posts', icon: ClockIcon }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setView(tab.id as any)}
                            className={`flex items-center gap-2.5 py-4 text-[10px] font-black uppercase tracking-widest transition-all relative group
                                ${view === tab.id ? 'text-black' : 'text-gray-400 hover:text-black'}`}
                        >
                            <tab.icon className={`w-3.5 h-3.5 ${view === tab.id ? 'text-black' : 'text-gray-300 group-hover:text-gray-500'}`} />
                            {tab.label}
                            {view === tab.id && (
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-black rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-[0.98]">
                <div className="max-w-7xl mx-auto">
                    {view === 'browse' && (
                        <div className="space-y-12">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/5 text-black rounded-lg text-[9px] font-black uppercase tracking-wider mb-2 border border-black/10">
                                        <SparklesIcon className="w-3 h-3" /> Talent Trading Platform
                                    </div>
                                    <h2 className="text-5xl font-black text-black uppercase italic tracking-tighter leading-none">
                                        Skill <span className="text-gray-400 not-italic">Swap</span> Arena
                                    </h2>
                                    <p className="text-gray-500 font-semibold text-lg max-w-xl">Trade your unique talents with other students for mutual growth</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {filteredSwaps.map(swap => (
                                    <div key={swap._id} className="group bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_25px_60px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 hover:-translate-y-2 flex flex-col p-7">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 rounded-2xl bg-gray-100 overflow-hidden border-2 border-white shadow-lg">
                                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${swap.creatorName}`} alt="avatar" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-black uppercase tracking-tighter line-clamp-1">{swap.creatorName}</span>
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest text-xs">Student Mentor</span>
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div className="p-4 bg-green-50/50 border border-green-100 rounded-2xl">
                                                <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">Offering/Teaching</p>
                                                <p className="text-sm font-black text-black italic uppercase tracking-tight">{swap.offering}</p>
                                            </div>
                                            <div className="flex justify-center -my-2 relative z-10">
                                                <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                                    <BoltIcon className="w-4 h-4 text-black" />
                                                </div>
                                            </div>
                                            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                                <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Seeking/Learning</p>
                                                <p className="text-sm font-black text-black italic uppercase tracking-tight">{swap.title}</p>
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-6 border-t border-gray-50 flex justify-end items-center">
                                            {swap.creatorId !== user.id ? (
                                                <button
                                                    onClick={() => handleAccept(swap._id)}
                                                    className="w-full py-4 bg-black hover:bg-gray-800 text-white rounded-2xl transition-all duration-300 font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center justify-center gap-2"
                                                >
                                                    Propose Swap <BoltIcon className="w-3 h-3 text-white" />
                                                </button>
                                            ) : (
                                                <div className="w-full py-3 bg-gray-100 text-gray-500 text-center rounded-xl text-[9px] font-black uppercase tracking-widest border border-gray-200">
                                                    My Trading Post
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'working' && (
                        <div className="max-w-5xl mx-auto space-y-10">
                            <div className="text-center space-y-4 mb-14">
                                <h2 className="text-5xl font-black text-black uppercase italic tracking-tighter">Learning <span className="text-gray-400">Agreements</span></h2>
                                <p className="text-gray-500 font-semibold text-lg">Manage your ongoing skill swaps and knowledge exchanges</p>
                            </div>

                            <div className="grid gap-10">
                                {swaps.map(swap => (
                                    <div key={swap._id} className="bg-white border-2 border-gray-100 rounded-[3.5rem] p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.03)] relative overflow-hidden group">
                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-10">
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2
                                                        ${swap.status === 'COMPLETED' ? 'bg-black text-white border-black' : 'bg-white text-black border-black animate-pulse'}`}>
                                                        {swap.status}
                                                    </span>
                                                    <span className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Agreement ID: {swap._id.slice(-8).toUpperCase()}</span>
                                                </div>
                                                <h3 className="text-3xl font-black text-black uppercase italic tracking-tighter leading-none">{swap.offering} ↔ {swap.title}</h3>
                                            </div>
                                            {swap.status === 'IN_PROGRESS' && (
                                                <div className="flex gap-4">
                                                    <button
                                                        onClick={() => handleComplete(swap._id)}
                                                        className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all flex items-center gap-2"
                                                    >
                                                        Complete Swap <BoltIcon className="w-4 h-4 text-white" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUncollaborate(swap._id)}
                                                        className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm transition-all"
                                                    >
                                                        Cancel Agreement
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-slate-500 text-base leading-relaxed mb-12 pb-12 border-b-2 border-dashed border-slate-100 font-medium">
                                            {swap.description}
                                        </p>

                                        {swap.status === 'IN_PROGRESS' && (
                                            <div className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                {/* Collaboration: Shared Plan */}
                                                <div className="bg-slate-50 border-2 border-black/5 rounded-[2.5rem] p-8 flex flex-col gap-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white shadow-lg">
                                                                <StarIcon className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-[11px] font-black text-black uppercase tracking-widest">Shared Learning Plan</h4>
                                                                <p className="text-[9px] font-bold text-gray-400 uppercase">Outline your milestones together</p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => startMeeting(swap._id)}
                                                            className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md group"
                                                        >
                                                            Launch Lumo Meeting <VideoIcon className="w-3 h-3 group-hover:rotate-12 transition-transform" />
                                                        </button>
                                                    </div>
                                                    <textarea 
                                                        className="flex-1 min-h-[180px] w-full p-6 bg-white border-2 border-transparent rounded-2xl text-sm font-semibold focus:border-black/10 focus:ring-4 focus:ring-black/5 transition-all resize-none shadow-sm"
                                                        placeholder="Plan:
Step 1: Introduction to basics
Step 2: Hands-on project
Step 3: Advanced techniques..."
                                                        defaultValue={swap.sharedPlan || ''}
                                                        onBlur={(e) => handleUpdatePlan(swap._id, e.target.value)}
                                                    />
                                                </div>

                                                {/* Collaboration: Chat Hub */}
                                                <div className="bg-slate-50 border-2 border-black/5 rounded-[2.5rem] p-8 flex flex-col gap-6 max-h-[400px]">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white shadow-lg">
                                                            <ChatIcon className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[11px] font-black text-black uppercase tracking-widest">Skill Swap Chat</h4>
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase">Communicate with your swap partner</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar no-scrollbar">
                                                        {(swap.messages || []).length === 0 && (
                                                            <p className="text-center text-gray-400 text-[10px] font-black uppercase tracking-widest mt-10">No messages yet. Say hello!</p>
                                                        )}
                                                        {swap.messages?.map((msg, idx) => (
                                                            <div key={idx} className={`flex flex-col ${msg.senderId === user.id ? 'items-end' : 'items-start'}`}>
                                                                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm font-semibold shadow-sm
                                                                    ${msg.senderId === user.id ? 'bg-black text-white' : 'bg-white text-black border border-black/5'}`}>
                                                                    {msg.text}
                                                                </div>
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase mt-1 tracking-widest">
                                                                    {msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex gap-3 pt-4 border-t border-black/5">
                                                        <input 
                                                            type="text" 
                                                            className="flex-1 px-5 py-3 bg-white border-2 border-transparent rounded-xl text-sm font-bold focus:border-black/10 focus:ring-4 focus:ring-black/5 transition-all shadow-sm"
                                                            placeholder="Type a message..."
                                                            value={msgText}
                                                            onChange={e => setMsgText(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage(swap._id)}
                                                        />
                                                        <button 
                                                            onClick={() => handleSendMessage(swap._id)}
                                                            className="p-3 bg-black hover:bg-gray-800 text-white rounded-xl shadow-lg transition-all active:scale-95"
                                                        >
                                                            <SendIcon className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {swap.aiVerdict && (
                                            <div className={`mt-10 p-10 rounded-[3rem] border-4 flex flex-col md:flex-row items-center gap-10 bg-gray-50 ${swap.aiVerdict.approved ? 'border-black' : 'border-gray-400'}`}>
                                                <div className="relative">
                                                    <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center bg-white ${swap.aiVerdict.approved ? 'border-black text-black' : 'border-gray-400 text-gray-400'}`}>
                                                        <span className="text-3xl font-black italic">{swap.aiVerdict.score}%</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-4 flex-1">
                                                    <p className="text-[11px] font-black text-black uppercase tracking-[0.25em]">AI Verification Report</p>
                                                    <p className="text-gray-600 text-lg italic font-semibold leading-relaxed">"{swap.aiVerdict.reason}"</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'posted' && (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-16">
                            <div className="xl:col-span-5">
                                <div className="bg-white border-2 border-gray-100 rounded-[4rem] p-12 shadow-2xl shadow-black/5 sticky top-12">
                                    <div className="mb-12">
                                        <div className="w-16 h-16 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner border border-gray-100">
                                            <SparklesIcon className="w-9 h-9 text-black" />
                                        </div>
                                        <h3 className="text-4xl font-black text-black uppercase italic tracking-tighter mb-2">Initialize <span className="text-gray-400">Swap</span></h3>
                                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em]">Deploy a new talent trade request to the arena</p>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">What skill can you teach?</label>
                                            <input
                                                type="text"
                                                className="w-full px-8 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] text-black font-black focus:bg-white focus:border-black/30 transition-all placeholder:text-gray-300 text-base"
                                                placeholder="e.g. Master of Classical Guitar..."
                                                value={newOffering}
                                                onChange={e => setNewOffering(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">What skill do you want to learn?</label>
                                            <input
                                                type="text"
                                                className="w-full px-8 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] text-black font-black focus:bg-white focus:border-black/30 transition-all placeholder:text-gray-300 text-base"
                                                placeholder="e.g. Python for Data Science..."
                                                value={newSeeking}
                                                onChange={e => setNewSeeking(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">Barter Details</label>
                                            <textarea
                                                className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[2.5rem] text-black font-semibold focus:bg-white focus:border-black/30 transition-all placeholder:text-gray-400 min-h-[150px] text-sm leading-relaxed"
                                                placeholder="Describe the trade: frequency, level of expertise, etc..."
                                                value={newDesc}
                                                onChange={e => setNewDesc(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={handlePostSwap}
                                            className="w-full py-6 bg-black hover:bg-gray-900 text-white font-black uppercase italic tracking-[0.25em] text-[11px] rounded-[2rem] transition-all shadow-2xl active:scale-[0.98]"
                                        >
                                            Post Trade Request
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="xl:col-span-7 space-y-8">
                                <div className="flex items-center justify-between mb-8 px-6">
                                    <h3 className="text-3xl font-black text-black uppercase italic tracking-tighter">My <span className="text-gray-400">Trade Posts</span></h3>
                                </div>

                                {swaps.map(swap => (
                                    <div key={swap._id} className="bg-white border-2 border-gray-100 p-10 rounded-[3.5rem] flex flex-col md:flex-row shadow-[0_15px_40px_-10px_rgba(0,0,0,0.02)] hover:border-black/30 transition-all duration-500">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex flex-wrap gap-4 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${swap.status === 'OPEN' ? 'bg-black' : 'bg-gray-400'}`} />
                                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-[0.2em]">{swap.status}</span>
                                                </div>
                                            </div>
                                            {editingSwapId === swap._id ? (
                                                <div className="space-y-3">
                                                    <input className="w-full px-4 py-2 border rounded-xl" value={editOffering} onChange={e => setEditOffering(e.target.value)} placeholder="Offering..." />
                                                    <input className="w-full px-4 py-2 border rounded-xl" value={editSeeking} onChange={e => setEditSeeking(e.target.value)} placeholder="Seeking..." />
                                                    <textarea className="w-full px-4 py-2 border rounded-xl" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleUpdate(swap._id)} className="px-4 py-2 bg-black text-white text-[10px] uppercase font-black tracking-widest rounded-xl">Save</button>
                                                        <button onClick={() => setEditingSwapId(null)} className="px-4 py-2 bg-gray-200 text-black text-[10px] uppercase font-black tracking-widest rounded-xl">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <h4 className="text-2xl font-black text-black uppercase italic leading-none">{swap.offering} ↔ {swap.title}</h4>
                                                    <p className="text-gray-400 text-sm font-semibold italic line-clamp-2">{swap.description}</p>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 min-w-[120px] mt-6 md:mt-0">
                                            {editingSwapId !== swap._id && (
                                                <>
                                                    <button onClick={() => startEditing(swap)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] border border-slate-200">Edit</button>
                                                    <button onClick={() => handleDelete(swap._id)} className="px-5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-black uppercase tracking-widest text-[10px] border border-red-100">Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {swaps.length === 0 && (
                                    <div className="py-40 text-center bg-white border-4 border-dashed border-gray-100 rounded-[5rem] flex flex-col items-center justify-center space-y-4">
                                        <p className="text-black font-black text-2xl uppercase italic tracking-tighter">No Active Trades</p>
                                        <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.3em]">Your talent pipeline is currently empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 20px; border: 3px solid transparent; background-clip: content-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }
            `}</style>
        </div >
    );
};

export default Marketplace;
