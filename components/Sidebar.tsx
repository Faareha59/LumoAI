import React, { useEffect, useState } from 'react';
import type { User, AppView } from '../types';
import { Role } from '../types';
import { DashboardIcon, VideoIcon, ChatIcon, GameIcon, TimerIcon, LogoutIcon, SparklesIcon, LumoLogo, PdfExplainerIcon } from './Icons';

interface SidebarProps {
  user: User;
  currentView: AppView;
  setView: (view: AppView) => void;
  onLogout: () => void;
}

const NavItem: React.FC<{ icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void; }> = ({ icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
        {icon}
        <span>{label}</span>
    </button>
);

const Sidebar: React.FC<SidebarProps> = ({ user, currentView, setView, onLogout }) => {
  const studentNav = [
    { view: 'student_dashboard' as AppView, label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" /> },
    { view: 'lecture_viewer' as AppView, label: 'Lectures', icon: <VideoIcon className="w-5 h-5" /> },
    { view: 'pdf_explainer' as AppView, label: 'PDF Explainer', icon: <PdfExplainerIcon className="w-5 h-5" /> },
    { view: 'chatbot' as AppView, label: 'Live Q&A Chatbot', icon: <ChatIcon className="w-5 h-5" /> },
    { view: 'study_tools' as AppView, label: 'Study Tools', icon: <TimerIcon className="w-5 h-5" /> },
    { view: 'coding_game' as AppView, label: 'Coding Game', icon: <GameIcon className="w-5 h-5" /> },
  ];

  const teacherNav = [
    { view: 'teacher_dashboard' as AppView, label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5" /> },
    { view: 'teacher_course_mgmt' as AppView, label: 'Course Management', icon: <SparklesIcon className="w-5 h-5" /> },
  ];

  const navItems = user.role === Role.Student ? studentNav : teacherNav;

  const [pomo, setPomo] = useState<{left:number; phase:string} | null>(null);
  useEffect(() => {
    const STORAGE_KEY = 'pomodoro_state_v1';
    const tick = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { setPomo(null); return; }
        const s = JSON.parse(raw) as { phase?: 'focus'|'short'|'long'; endAt?: number|null };
        if (s?.endAt && s.endAt > Date.now()) {
          const left = Math.max(0, Math.floor((s.endAt - Date.now())/1000));
          setPomo({ left, phase: s.phase || 'focus' });
        } else {
          setPomo(null);
        }
      } catch { setPomo(null); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="w-64 bg-background border-r border-border flex-col p-4 hidden md:flex">
      <div className="flex items-center gap-2 mb-8">
          <LumoLogo className="w-8 h-8 text-foreground" />
          <h1 className="text-xl font-bold text-foreground">LumoAI</h1>
      </div>
      <nav className="flex-1 space-y-2">
        {navItems.map(item => (
          <NavItem
            key={item.view}
            label={item.label}
            icon={item.icon}
            isActive={currentView === item.view}
            onClick={() => setView(item.view)}
          />
        ))}
      </nav>
      {pomo && (
        <button onClick={() => setView('study_tools' as AppView)} className="mt-3 mx-1 px-3 py-2 rounded-md border border-border text-sm flex items-center justify-between">
          <span className="font-medium">Timer</span>
          <span className="ml-2 rounded-full px-2 py-0.5 bg-foreground text-background text-xs">
            {pomo.phase==='focus'?'Focus':pomo.phase==='short'?'Short':'Long'} · {String(Math.floor(pomo.left/60)).padStart(2,'0')}:{String(pomo.left%60).padStart(2,'0')}
          </span>
        </button>
      )}
      <div>
        <div className="border-t border-border my-4"></div>
        <div className="px-3 py-2 text-sm text-foreground">
            <p className="font-semibold">{user.name}</p>
            <p className="text-muted capitalize">{user.role}</p>
        </div>
         <NavItem
            label="Logout"
            icon={<LogoutIcon className="w-5 h-5" />}
            isActive={false}
            onClick={onLogout}
        />
      </div>
    </aside>
  );
};

export default Sidebar;