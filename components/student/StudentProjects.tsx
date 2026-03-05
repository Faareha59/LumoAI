
import React, { useState, useEffect, useRef } from 'react';
import { Project, ProjectInvite, ProjectFile } from '../../types';
import {
    SparklesIcon,
    CodeBracketIcon,
    UserIcon,
    ClockIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    XCircleIcon,
    PlusIcon,
    DeleteIcon,
    XIcon,
    TerminalIcon,
    SendIcon,
    ChatIcon,
    InfoIcon,
    ActivityIcon,
    ExternalLinkIcon,
    PaperclipIcon,
    TrashIcon,
    DownloadIcon
} from '../Icons';
import { getToken } from '../../services/authService';

const StudentProjects: React.FC<{ user: any }> = ({ user }) => {
    const [view, setView] = useState<'hub' | 'invites' | 'project_detail'>('hub');
    const [projects, setProjects] = useState<Project[]>([]);
    const [invites, setInvites] = useState<ProjectInvite[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeProject, setActiveProject] = useState<Project | null>(null);

    // Create Form
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newRepoUrl, setNewRepoUrl] = useState('');

    // Invite Form
    const [inviteEmail, setInviteEmail] = useState('');

    const [auditResult, setAuditResult] = useState<any>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [detailTab, setDetailTab] = useState<'overview' | 'audit'>('overview');

    useEffect(() => {
        if (view === 'hub') fetchProjects();
        if (view === 'invites') fetchInvites();
    }, [view]);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch('/api/projects', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setProjects(data.projects || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchInvites = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch('/api/invites', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setInvites(data.invites || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const handleDownloadWorkspace = () => {
        if (!activeProject || !activeProject.files) return;

        activeProject.files.forEach(file => {
            const blob = new Blob([file.content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        });
    };

    const handleCreateProject = async () => {
        if (!newTitle) return;
        try {
            const token = getToken();
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: newTitle, description: newDesc, repoUrl: newRepoUrl })
            });
            if (res.ok) {
                const data = await res.json();
                setShowCreate(false);
                setNewTitle('');
                setNewDesc('');
                setNewRepoUrl('');
                fetchProjects();
                handleOpenProject(data.project);
            }
        } catch (e) { console.error(e); }
    };

    const handleOpenProject = (p: Project) => {
        setActiveProject(p);
        setView('project_detail');
        setAuditResult(null);
        setDetailTab('overview');
    };

    const handleAudit = async () => {
        if (!activeProject) return;
        setIsAuditing(true);
        try {
            const token = getToken();
            const res = await fetch(`/api/projects/${activeProject._id}/audit`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setAuditResult(data);
        } catch (e) {
            console.error(e);
        }
        setIsAuditing(false);
    };

    const handleRespondInvite = async (id: string, accept: boolean) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/invites/${id}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ accept })
            });
            if (res.ok) fetchInvites();
        } catch (e) { console.error(e); }
    };

    return (
        <div className="h-full bg-slate-50 flex flex-col font-sans overflow-hidden">
            {/* Top Navigation Bar */}
            <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setView('hub')}
                        className={`text-sm font-bold tracking-tight uppercase hover:text-indigo-600 transition-colors ${view === 'hub' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        Project Hub
                    </button>
                    <span className="text-slate-300">/</span>
                    <button
                        onClick={() => setView('invites')}
                        className={`text-sm font-bold tracking-tight uppercase hover:text-indigo-600 transition-colors ${view === 'invites' ? 'text-indigo-600' : 'text-slate-400'}`}
                    >
                        Invitations {invites.length > 0 && `(${invites.length})`}
                    </button>
                    {activeProject && view === 'project_detail' && (
                        <>
                            <span className="text-slate-300">/</span>
                            <span className="text-sm font-black uppercase text-slate-900 italic tracking-tighter">
                                {activeProject.title}
                            </span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {view === 'hub' && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-full hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                        >
                            <PlusIcon className="w-3 h-3" /> New Repo
                        </button>
                    )}
                </div>
            </nav>

            <main className="flex-1 overflow-hidden relative">
                {view === 'hub' && (
                    <div className="p-12 max-w-7xl mx-auto space-y-12 overflow-y-auto h-full custom-scrollbar pb-32">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                                <SparklesIcon className="w-3 h-3 text-indigo-600" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">AI-Verified Repositories</span>
                            </div>
                            <h1 className="text-5xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">
                                Collaborative <span className="text-indigo-600">Studios</span>
                            </h1>
                            <p className="text-slate-500 text-sm max-w-lg font-medium">
                                Build, shared, and audit your technical projects with AI governance.
                                Professional workspace for technical mastery.
                            </p>
                        </div>

                        {showCreate && (
                            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 max-w-xl">
                                <h3 className="text-lg font-black uppercase italic text-slate-900 mb-6">Initialize New Project</h3>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Repository Name</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-indigo-500 transition-colors font-bold"
                                            placeholder="e.g. neural-network-opt"
                                            value={newTitle}
                                            onChange={e => setNewTitle(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Description</label>
                                        <textarea
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-indigo-500 transition-colors font-medium min-h-[100px]"
                                            placeholder="What are the core technical goals?"
                                            value={newDesc}
                                            onChange={e => setNewDesc(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">GitHub / External Repo URL (Optional)</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-indigo-500 transition-colors font-bold"
                                            placeholder="https://github.com/user/repo"
                                            value={newRepoUrl}
                                            onChange={e => setNewRepoUrl(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-4 pt-4">
                                        <button onClick={handleCreateProject} className="flex-1 bg-indigo-600 text-white font-black uppercase tracking-widest py-4 rounded-2xl hover:bg-indigo-700 transition-all">Create</button>
                                        <button onClick={() => setShowCreate(false)} className="px-8 bg-slate-100 text-slate-500 font-black uppercase tracking-widest py-4 rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {projects.map(p => (
                                <div
                                    key={p._id}
                                    onClick={() => handleOpenProject(p)}
                                    className="group bg-white border border-slate-200 p-8 rounded-[2rem] hover:border-indigo-500 hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                            <CodeBracketIcon className="w-6 h-6" />
                                        </div>
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${p.ownerId === user.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {p.ownerId === user.id ? 'Lead' : 'Member'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase italic mb-2 leading-tight">{p.title}</h3>
                                    <p className="text-slate-500 text-xs font-medium line-clamp-2 leading-relaxed mb-6">
                                        {p.description || "No description provided."}
                                    </p>

                                    <div className="flex items-center gap-2 pt-6 border-t border-slate-50">
                                        <div className="flex -space-x-2">
                                            {p.collaborators?.slice(0, 3).map((c, i) => (
                                                <div key={i} className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[8px] font-black">
                                                    {c.name.charAt(0)}
                                                </div>
                                            ))}
                                            {p.collaborators?.length > 3 && (
                                                <div className="w-6 h-6 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[8px] font-black text-indigo-600">
                                                    +{p.collaborators.length - 3}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                                            {p.collaborators?.length || 0} Contributors
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {view === 'invites' && (
                    <div className="p-12 max-w-4xl mx-auto space-y-12 overflow-y-auto h-full pb-32">
                        <h1 className="text-4xl font-black text-slate-900 italic tracking-tighter uppercase">Inbound <span className="text-indigo-600">Requests</span></h1>
                        <div className="space-y-4">
                            {invites.map(inv => (
                                <div key={inv._id} className="bg-white border border-slate-200 p-8 rounded-[2rem] flex items-center justify-between hover:shadow-xl transition-all">
                                    <div className="flex items-center gap-6">
                                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                            <UserIcon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="font-black text-lg text-slate-900 italic uppercase">{inv.projectTitle}</p>
                                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">User: {inv.senderName}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => handleRespondInvite(inv._id, true)} className="px-8 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-full">Accept</button>
                                        <button onClick={() => handleRespondInvite(inv._id, false)} className="px-8 py-3 bg-slate-100 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-full">Decline</button>
                                    </div>
                                </div>
                            ))}
                            {invites.length === 0 && (
                                <div className="text-center py-20 bg-white border border-slate-100 rounded-[2rem]">
                                    <p className="text-slate-400 font-black uppercase italic tracking-widest">No pending invitations</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {view === 'project_detail' && activeProject && (
                    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
                        {/* Detail Tabs */}
                        <div className="bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
                            <div className="flex gap-10">
                                {[
                                    { id: 'overview', label: 'Overview', icon: InfoIcon },
                                    { id: 'audit', label: 'Lumo Audit', icon: ActivityIcon }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setDetailTab(tab.id as any)}
                                        className={`flex items-center gap-2.5 py-4 text-[10px] font-black uppercase tracking-widest transition-all relative
                                            ${detailTab === tab.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-900'}`}
                                    >
                                        <tab.icon className="w-3.5 h-3.5" />
                                        {tab.label}
                                        {detailTab === tab.id && (
                                            <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-600 rounded-t-full shadow-[0_-4px_8px_rgba(79,70,229,0.3)]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {detailTab === 'overview' && (
                                <div className="flex-1 overflow-y-auto p-12 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat">
                                    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                        <div className="bg-white border border-slate-200 rounded-[3rem] p-12 shadow-xl shadow-indigo-100/50">
                                            <div className="flex justify-between items-start mb-8">
                                                <div className="space-y-4">
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                                        Active Repository
                                                    </div>
                                                    <h2 className="text-5xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{activeProject.title}</h2>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Audit Score</span>
                                                    <div className="text-4xl font-black text-indigo-600 italic">{auditResult?.relevanceScore || '??'}%</div>
                                                </div>
                                            </div>

                                            <p className="text-slate-600 text-lg font-medium leading-relaxed mb-10 pb-10 border-b border-slate-100 italic">
                                                "{activeProject.description || "No description provided for this technical studio."}"
                                            </p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                                                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 space-y-4">
                                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Control</h4>
                                                    {activeProject.repoUrl ? (
                                                        <a href={activeProject.repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-indigo-600 hover:text-indigo-700 font-black uppercase text-xs transition-all group">
                                                            <ExternalLinkIcon className="w-4 h-4" />
                                                            Open GitHub Repository
                                                        </a>
                                                    ) : (
                                                        <p className="text-slate-400 text-xs font-bold uppercase italic">No global repo linked</p>
                                                    )}
                                                </div>
                                                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 space-y-4">
                                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workspace Actions</h4>
                                                    <button
                                                        onClick={handleDownloadWorkspace}
                                                        className="flex items-center gap-3 text-slate-600 hover:text-indigo-600 font-black uppercase text-xs transition-all w-full"
                                                    >
                                                        <DownloadIcon className="w-4 h-4" />
                                                        Extract Source (ZIP)
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex gap-6">
                                                <button
                                                    onClick={() => setDetailTab('audit')}
                                                    className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase italic tracking-[0.2em] text-[11px] rounded-2xl transition-all shadow-xl shadow-indigo-200 active:scale-95 flex items-center justify-center gap-3"
                                                >
                                                    <ActivityIcon className="w-4 h-4" />
                                                    Run Technical Audit
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Collaborators</h4>
                                                <div className="flex -space-x-2">
                                                    {activeProject.collaborators.map(c => (
                                                        <div key={c.userId} className="w-10 h-10 rounded-2xl bg-indigo-100 border-4 border-white flex items-center justify-center text-[10px] font-black text-indigo-700" title={c.name}>
                                                            {c.name.charAt(0)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="col-span-2 bg-white border border-slate-200 rounded-[2rem] p-8 space-y-4">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Activity</h4>
                                                <div className="flex items-center gap-4 py-2 border-b border-slate-50">
                                                    <ClockIcon className="w-4 h-4 text-slate-300" />
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Last updated: {new Date(activeProject.lastUpdated).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {detailTab === 'audit' && (
                                <div className="flex-1 overflow-y-auto p-12 space-y-12 bg-slate-50 custom-scrollbar text-slate-900">
                                    {!auditResult && (
                                        <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
                                            <div className="w-24 h-24 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto shadow-xl">
                                                <ActivityIcon className="w-12 h-12 text-slate-200" />
                                            </div>
                                            <div className="space-y-4">
                                                <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Technical Audit Pending</h3>
                                                <p className="text-slate-500 font-medium">Lumo AI will scan your current workspace against the project requirements.</p>
                                            </div>
                                            <button
                                                onClick={handleAudit}
                                                disabled={isAuditing}
                                                className="px-12 py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase italic tracking-[0.2em] text-[11px] rounded-2xl transition-all shadow-2xl shadow-indigo-100"
                                            >
                                                {isAuditing ? 'Initiating Quantum Scan...' : 'Start Audit'}
                                            </button>
                                        </div>
                                    )}
                                    {auditResult && (
                                        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-500">
                                            <div className="flex flex-col md:flex-row gap-8">
                                                <div className="flex-1 bg-white border border-slate-200 p-8 rounded-[3rem] space-y-8 shadow-xl">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <ActivityIcon className="w-5 h-5 text-indigo-600" />
                                                            <h4 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Goal Alignment</h4>
                                                        </div>
                                                        <div className="text-4xl font-black text-indigo-600 italic tracking-tighter">{auditResult.relevanceScore}%</div>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${auditResult.relevanceScore}%` }} />
                                                    </div>
                                                    <p className="text-slate-600 text-base font-semibold italic leading-relaxed">
                                                        "{auditResult.relevantAnalysis}"
                                                    </p>
                                                </div>

                                                <div className="w-full md:w-80 bg-white border border-slate-200 p-8 rounded-[3rem] space-y-6 shadow-xl">
                                                    <div className="flex items-center gap-3">
                                                        <PaperclipIcon className="w-4 h-4 text-slate-400" />
                                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unrelated Segments</h4>
                                                    </div>
                                                    <div className="space-y-3">
                                                        {auditResult.unrelatedParts?.map((p: string, i: number) => (
                                                            <div key={i} className="flex gap-3 text-red-600 text-[10px] font-black uppercase italic items-start">
                                                                <XCircleIcon className="w-4 h-4 shrink-0" />
                                                                <span>{p}</span>
                                                            </div>
                                                        ))}
                                                        {auditResult.unrelatedParts?.length === 0 && (
                                                            <div className="flex gap-3 text-emerald-600 text-[10px] font-black uppercase italic">
                                                                <CheckCircleIcon className="w-4 h-4" />
                                                                Structure Perfect
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                                                <div className="relative z-10 space-y-6">
                                                    <div className="flex items-center gap-3">
                                                        <SparklesIcon className="w-6 h-6 text-indigo-400" />
                                                        <h4 className="text-2xl font-black uppercase italic tracking-tight">Technical Verdict</h4>
                                                    </div>
                                                    <p className="text-indigo-100 text-lg font-medium leading-relaxed italic max-w-4xl">
                                                        {auditResult.technicalVerdict || `The codebase is being compared against ${activeProject.title}. Lumo AI confirms ${auditResult.relevanceScore}% functional relevance.`}
                                                    </p>
                                                    <div className="flex gap-4 pt-6">
                                                        <button onClick={() => setDetailTab('audit')} className="px-8 py-3 bg-white text-slate-900 font-black uppercase text-[10px] rounded-xl hover:bg-indigo-50 transition-all">View Audit Report</button>
                                                        <button onClick={handleDownloadWorkspace} className="px-8 py-3 bg-white/10 text-white border border-white/20 font-black uppercase text-[10px] rounded-xl hover:bg-white/20 transition-all">Download Source</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.2); border-radius: 10px; }
                
                .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar-dark::-webkit-scrollbar-track { background: #1e1e1e; }
                .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
                
                .slide-in-bottom { animation: slideIn 0.3s ease-out; }
                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </div>
    );
};

export default StudentProjects;
