import React, { useState, useEffect } from 'react';
import { MarketplaceJob } from '../../types';
import { SparklesIcon, SearchIcon, FilterIcon, ClockIcon, UserIcon, BoltIcon, StarIcon, SendIcon } from '../Icons';
import { getToken } from '../../services/authService';

const Marketplace: React.FC<{ user: any }> = ({ user }) => {
    const [view, setView] = useState<'browse' | 'posted' | 'working'>('browse');
    const [jobs, setJobs] = useState<MarketplaceJob[]>([]);
    const [balance, setBalance] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');

    // Form state
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newBudget, setNewBudget] = useState(500);

    const [submissionText, setSubmissionText] = useState('');
    const [selectedJob, setSelectedJob] = useState<MarketplaceJob | null>(null);

    const categories = ['All', 'Machine Learning', 'Web Development', 'Data Science', 'Content Writing', 'UI/UX Design'];

    useEffect(() => {
        fetchBalance();
        if (view === 'browse') fetchJobs();
        if (view === 'posted' || view === 'working') fetchMyJobs();
    }, [view]);

    const fetchBalance = async () => {
        try {
            const token = getToken();
            const res = await fetch('/api/marketplace/wallet', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setBalance(data.balance || 0);
        } catch (e) { console.error(e); }
    };

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/marketplace/jobs');
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch (e) { console.error(e); }
    };

    const fetchMyJobs = async () => {
        try {
            const token = getToken();
            const res = await fetch('/api/marketplace/my-jobs', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (view === 'posted') setJobs(data.posted || []);
            else setJobs(data.working || []);
        } catch (e) { console.error(e); }
    };

    const handlePostJob = async () => {
        try {
            const token = getToken();
            const res = await fetch('/api/marketplace/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ title: newTitle, description: newDesc, budget: newBudget })
            });
            if (res.ok) {
                alert('Job posted successfully!');
                setNewTitle('');
                setNewDesc('');
                setView('posted');
            } else {
                alert('Failed to post job');
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
                alert('Job accepted! Go to "My Works" to view it.');
                fetchJobs();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to accept');
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
                    alert(`Submission Approved by AI!\nScore: ${data.verdict.score}\nReason: ${data.verdict.reason}`);
                } else {
                    alert(`Submission REJECTED/FLAGGED by AI.\nScore: ${data.verdict.score}\nReason: ${data.verdict.reason}`);
                }
                setSubmissionText('');
                setSelectedJob(null);
                fetchMyJobs();
                fetchBalance();
            } else {
                alert('Submission failed');
            }
        } catch (e) { console.error(e); }
    };

    const filteredJobs = jobs.filter(j =>
        (j.title.toLowerCase().includes(searchQuery.toLowerCase()) || j.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
        (activeCategory === 'All' || j.title.toLowerCase().includes(activeCategory.toLowerCase()) || j.description.toLowerCase().includes(activeCategory.toLowerCase()))
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
                                placeholder="What specialized service do you need for your project?"
                                className="w-full pl-14 pr-6 py-4 bg-gray-50/50 border-2 border-transparent rounded-[2rem] text-black placeholder:text-gray-400 focus:bg-white focus:border-black/30 focus:ring-4 focus:ring-black/5 transition-all font-semibold text-base shadow-inner"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] leading-none mb-1.5">Investment Balance</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-black italic tracking-tighter">PKR {balance.toLocaleString()}</span>
                                <div className="p-1 px-2 bg-black text-white rounded-lg text-[8px] font-black uppercase tracking-widest">+2.4%</div>
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center text-white shadow-xl shadow-black/10 hover:rotate-6 transition-transform cursor-pointer">
                            <UserIcon className="w-6 h-6" />
                        </div>
                    </div>
                </div>

                {/* Categories Tab Bar - Premium Interactive Pill Design */}
                <div className="max-w-7xl mx-auto mt-6 flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 transform active:scale-95
                                ${activeCategory === cat
                                    ? 'bg-black text-white shadow-lg shadow-black/10'
                                    : 'bg-white text-gray-500 border border-gray-200 hover:border-black hover:text-black hover:bg-gray-50/50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </header>

            {/* Glassmorphism View Switcher */}
            < div className="bg-slate-50/30 backdrop-blur-md border-b border-slate-200 px-8 py-1" >
                <div className="max-w-7xl mx-auto flex gap-10">
                    {[
                        { id: 'browse', label: 'Explore Services', icon: SearchIcon },
                        { id: 'working', label: 'My Collaborations', icon: BoltIcon },
                        { id: 'posted', label: 'Contract Manager', icon: ClockIcon }
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
            </div >

            <main className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-[0.98]">
                <div className="max-w-7xl mx-auto">
                    {view === 'browse' && (
                        <div className="space-y-12">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/5 text-black rounded-lg text-[9px] font-black uppercase tracking-wider mb-2 border border-black/10">
                                        <SparklesIcon className="w-3 h-3" /> New Talent Available
                                    </div>
                                    <h2 className="text-5xl font-black text-black uppercase italic tracking-tighter leading-none">
                                        Global <span className="text-gray-400 not-italic">Talent</span> Hub
                                    </h2>
                                    <p className="text-gray-500 font-semibold text-lg max-w-xl">Scale your project's potential with elite student contributors</p>
                                </div>
                                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                                    <span className="text-slate-400 font-black text-[9px] uppercase tracking-widest pl-2">Sort By</span>
                                    <select className="bg-slate-50 border-none text-[10px] font-black uppercase tracking-widest text-slate-700 rounded-xl focus:ring-0 cursor-pointer">
                                        <option>Recommended</option>
                                        <option>Price: High to Low</option>
                                        <option>Top Rated</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                {filteredJobs.map(job => (
                                    <div key={job._id} className="group bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] hover:shadow-[0_25px_60px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 hover:-translate-y-2 flex flex-col">
                                        {/* Premium Thumbnail Section */}
                                        <div className="aspect-[1.5/1] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10" />
                                            <img
                                                src={`https://images.unsplash.com/photo-${job.title.toLowerCase().includes('ml') || job.title.toLowerCase().includes('learning') ? '1555255707-c0796c88b1ee' : '1587620962725-abab7fe55159'}?auto=format&fit=crop&q=80&w=800`}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                                                alt="Gig Thumbnail"
                                            />
                                            <div className="absolute top-5 left-5 z-20 px-4 py-1.5 bg-black/80 backdrop-blur-md rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] text-white border border-white/20 shadow-xl">
                                                Verified Pro
                                            </div>
                                            <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white">
                                                    <StarIcon className="w-4 h-4 text-white fill-white" />
                                                </div>
                                                <span className="text-white font-black text-sm tracking-tighter">4.9 <span className="text-white/60 font-medium text-[10px] uppercase">(12)</span></span>
                                            </div>
                                        </div>

                                        <div className="p-7 flex flex-col flex-1">
                                            <div className="flex items-center gap-3 mb-5">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-2xl bg-gray-100 overflow-hidden border-2 border-white shadow-lg">
                                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${job.creatorName}`} alt="avatar" />
                                                    </div>
                                                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-black border-2 border-white rounded-full" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-black text-black uppercase tracking-tighter line-clamp-1">{job.creatorName}</span>
                                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Level 2 Contributor</span>
                                                </div>
                                            </div>

                                            <h3 className="text-base font-black text-black leading-tight mb-6 group-hover:text-black transition-colors line-clamp-2 min-h-[3rem] tracking-tight">
                                                {job.title}
                                            </h3>

                                            <div className="mt-auto pt-6 border-t border-gray-50 flex justify-between items-center">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.1em] mb-1">Commission Price</span>
                                                    <span className="text-xl font-black text-black italic tracking-tighter uppercase leading-none">PKR {job.budget}</span>
                                                </div>

                                                {job.creatorId !== user.id ? (
                                                    <button
                                                        onClick={() => handleAccept(job._id)}
                                                        className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-2xl transition-all duration-300 font-black uppercase tracking-widest text-[10px] shadow-lg hover:shadow-black/10 active:scale-95 flex items-center gap-2"
                                                    >
                                                        Hire <BoltIcon className="w-3 h-3 text-white" />
                                                    </button>
                                                ) : (
                                                    <div className="px-5 py-2 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-black/10">
                                                        Active Gig
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'working' && (
                        <div className="max-w-5xl mx-auto space-y-10">
                            <div className="text-center space-y-4 mb-14">
                                <h2 className="text-5xl font-black text-black uppercase italic tracking-tighter">Active <span className="text-gray-400">Contracts</span></h2>
                                <p className="text-gray-500 font-semibold text-lg">Manage your ongoing technical collaborations and deliveries</p>
                            </div>

                            <div className="grid gap-10">
                                {jobs.map(job => (
                                    <div key={job._id} className="bg-white border-2 border-gray-100 rounded-[3.5rem] p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.03)] relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-gray-50 rounded-full -translate-y-1/2 translate-x-1/2 -z-10 group-hover:scale-110 transition-transform duration-700" />

                                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-10">
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border-2
                                                        ${job.status === 'COMPLETED' ? 'bg-black text-white border-black shadow-sm' : 'bg-white text-black border-black animate-pulse'}`}>
                                                        {job.status}
                                                    </span>
                                                    <span className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Contract ID: {job._id.slice(-8).toUpperCase()}</span>
                                                </div>
                                                <h3 className="text-3xl font-black text-black uppercase italic tracking-tighter leading-none">{job.title}</h3>
                                            </div>
                                            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 min-w-[200px] text-center">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Escrow Protected Funds</p>
                                                <p className="text-3xl font-black text-black tracking-tighter uppercase italic leading-none">PKR {job.budget}</p>
                                            </div>
                                        </div>

                                        <p className="text-slate-500 text-base leading-relaxed mb-12 pb-12 border-b-2 border-dashed border-slate-100 font-medium">
                                            {job.description}
                                        </p>

                                        {job.status === 'IN_PROGRESS' && (
                                            <div className="space-y-8 bg-gray-50 p-10 rounded-[2.5rem] border-2 border-black/10">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-black rounded-2xl shadow-lg shadow-black/10">
                                                            <BoltIcon className="w-6 h-6 text-white" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-[11px] font-black text-black uppercase tracking-widest">Technical Delivery Terminal</h4>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Files verified by Lumo Arbitrator AI</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <textarea
                                                    className="w-full h-64 p-8 bg-white border-2 border-gray-100 rounded-[2rem] text-black font-medium text-base focus:ring-4 focus:ring-black/5 focus:border-black transition-all shadow-xl shadow-black/5 placeholder:text-gray-300 resize-none"
                                                    placeholder="Inject your source code, technical breakdown, or delivery URL here..."
                                                    value={selectedJob?._id === job._id ? submissionText : ''}
                                                    onChange={(e) => {
                                                        setSelectedJob(job);
                                                        setSubmissionText(e.target.value);
                                                    }}
                                                />
                                                <div className="flex justify-between items-center bg-white px-8 py-4 rounded-3xl shadow-sm border border-gray-100">
                                                    <div className="flex items-center gap-2 text-black font-black text-[10px] uppercase tracking-widest">
                                                        <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                                                        Encrypted Channel Active
                                                    </div>
                                                    <button
                                                        onClick={() => handleSubmit(job._id)}
                                                        disabled={!submissionText || (selectedJob?._id !== job._id)}
                                                        className="px-14 py-5 bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-black uppercase italic tracking-[0.2em] text-[11px] rounded-2xl transition-all shadow-2xl shadow-black/20 active:scale-95 group flex items-center gap-3"
                                                    >
                                                        Final Delivery <SendIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {job.aiVerdict && (
                                            <div className={`mt-10 p-10 rounded-[3rem] border-4 flex flex-col md:flex-row items-center gap-10
                                                ${job.aiVerdict.approved ? 'bg-gray-50 border-black' : 'bg-gray-50 border-gray-400'}`}>
                                                <div className="relative">
                                                    <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center
                                                        ${job.aiVerdict.approved ? 'border-black bg-white text-black' : 'border-gray-400 bg-white text-gray-400'}`}>
                                                        <span className="text-3xl font-black italic">{job.aiVerdict.score}%</span>
                                                    </div>
                                                    <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-white shadow-lg
                                                        ${job.aiVerdict.approved ? 'bg-black' : 'bg-gray-400'}`}>
                                                        Verdict
                                                    </div>
                                                </div>
                                                <div className="space-y-4 flex-1 text-center md:text-left">
                                                    <div className="flex items-center justify-center md:justify-start gap-4">
                                                        <p className="text-[11px] font-black text-black uppercase tracking-[0.25em]">AI Arbitration Report</p>
                                                        <div className={`w-full max-w-[100px] h-1.5 rounded-full overflow-hidden bg-gray-200`}>
                                                            <div className={`h-full transition-all duration-1000 ${job.aiVerdict.approved ? 'bg-black' : 'bg-gray-400'}`} style={{ width: `${job.aiVerdict.score}%` }} />
                                                        </div>
                                                    </div>
                                                    <p className="text-gray-600 text-lg italic font-semibold leading-relaxed">"{job.aiVerdict.reason}"</p>
                                                    <div className="flex items-center justify-center md:justify-start gap-6">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Review Date: {new Date(job.completedAt || Date.now()).toLocaleDateString()}</span>
                                                        <span className="text-[9px] font-black text-black uppercase tracking-widest cursor-pointer hover:underline">Download Receipt PDF</span>
                                                    </div>
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
                                <div className="bg-white border-2 border-gray-100 rounded-[4rem] p-12 shadow-2xl shadow-black/5 sticky top-12 overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-3 bg-black" />

                                    <div className="mb-12">
                                        <div className="w-16 h-16 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner border border-gray-100">
                                            <BoltIcon className="w-9 h-9 text-black" />
                                        </div>
                                        <h3 className="text-4xl font-black text-black uppercase italic tracking-tighter mb-2">Initialize <span className="text-gray-400">Gig</span></h3>
                                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.3em]">Deploy a new micro-contract to the talent pool</p>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">Project Headline</label>
                                            <input
                                                type="text"
                                                className="w-full px-8 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] text-black font-black focus:bg-white focus:border-black/30 transition-all placeholder:text-gray-300 text-base"
                                                placeholder="e.g. Architect an LLM RAG Pipeline..."
                                                value={newTitle}
                                                onChange={e => setNewTitle(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">Technical Specification</label>
                                            <textarea
                                                className="w-full px-8 py-6 bg-gray-50 border-2 border-transparent rounded-[2.5rem] text-black font-semibold focus:bg-white focus:border-black/30 transition-all placeholder:text-gray-400 min-h-[200px] text-sm leading-relaxed"
                                                placeholder="Break down the required tech stack, deliverables, and performance metrics..."
                                                value={newDesc}
                                                onChange={e => setNewDesc(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-black uppercase tracking-widest ml-2">Contract Value (PKR)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    className="w-full pl-20 pr-8 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] text-black font-black focus:bg-white focus:border-black/30 transition-all text-xl"
                                                    value={newBudget}
                                                    onChange={e => setNewBudget(Number(e.target.value))}
                                                />
                                                <div className="absolute left-6 top-1/2 -translate-y-1/2 px-2 py-1 bg-black text-white rounded-lg font-black text-[9px] uppercase italic">PKR</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handlePostJob}
                                            className="w-full py-6 bg-black hover:bg-gray-900 text-white font-black uppercase italic tracking-[0.25em] text-[11px] rounded-[2rem] transition-all shadow-2xl shadow-black/10 active:scale-[0.98]"
                                        >
                                            Deploy Contract
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="xl:col-span-7 space-y-8">
                                <div className="flex items-center justify-between mb-8 px-6">
                                    <h3 className="text-3xl font-black text-black uppercase italic tracking-tighter">My <span className="text-gray-400">Requests</span></h3>
                                    <div className="px-4 py-1.5 bg-gray-100 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest shadow-inner">Active Listings: {jobs.length}</div>
                                </div>

                                {jobs.map(job => (
                                    <div key={job._id} className="bg-white border-2 border-gray-100 p-10 rounded-[3.5rem] flex flex-col md:flex-row items-center gap-10 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.02)] group hover:border-black/30 hover:shadow-xl hover:shadow-black/5 transition-all duration-500">
                                        <div className="w-24 h-24 bg-gray-50 rounded-[2rem] overflow-hidden flex-shrink-0 relative shadow-lg group-hover:rotate-3 transition-transform">
                                            <img
                                                src={`https://images.unsplash.com/photo-${job.title.toLowerCase().includes('ml') || job.title.toLowerCase().includes('learning') ? '1555255707-c0796c88b1ee' : '1587620962725-abab7fe55159'}?auto=format&fit=crop&q=80&w=200`}
                                                className="w-full h-full object-cover"
                                                alt="Gig Icon"
                                            />
                                            <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                                        </div>
                                        <div className="flex-1 text-center md:text-left space-y-3">
                                            <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${job.status === 'OPEN' ? 'bg-black' : 'bg-gray-400 animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.1)]'}`} />
                                                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-[0.2em]">{job.status}</span>
                                                </div>
                                                <div className="text-[9px] font-black uppercase text-gray-300 tracking-[0.2em] border-l border-gray-100 pl-4">
                                                    Freelancer: <span className="text-black italic">{job.freelancerName || 'N/A'}</span>
                                                </div>
                                            </div>
                                            <h4 className="text-2xl font-black text-black uppercase italic tracking-tight group-hover:text-black transition-colors leading-none">{job.title}</h4>
                                            <p className="text-gray-400 text-sm font-semibold italic line-clamp-1 max-w-md">{job.description}</p>
                                        </div>
                                        <div className="text-center md:text-right min-w-[120px]">
                                            <p className="text-2xl font-black text-black tracking-tighter uppercase italic leading-none mb-1">PKR {job.budget}</p>
                                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest leading-none">Flat Rate</span>
                                        </div>
                                    </div>
                                ))}

                                {jobs.length === 0 && (
                                    <div className="py-40 text-center bg-white border-4 border-dashed border-gray-100 rounded-[5rem] flex flex-col items-center justify-center space-y-6">
                                        <div className="p-8 bg-gray-50 rounded-full border-2 border-white shadow-inner">
                                            <FilterIcon className="w-16 h-16 text-gray-200" />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-black font-black text-2xl uppercase italic tracking-tighter">No Active Gigs</p>
                                            <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.3em]">Your hiring pipeline is currently empty</p>
                                        </div>
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
