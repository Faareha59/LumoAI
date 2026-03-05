import React, { useState } from 'react';
import PomodoroTimer from './PomodoroTimer';
import FeynmanTechnique from './FeynmanTechnique';
import { TimerIcon, SparklesIcon, BoltIcon, BookOpenIcon } from '../Icons';
import type { Course } from '../../types';

interface Props {
  courses: Course[];
  enrolledCourseIds: string[];
}

type ToolType = 'pomodoro' | 'feynman' | null;

const StudyTools: React.FC<Props> = ({ courses, enrolledCourseIds }) => {
  const [activeTool, setActiveTool] = useState<ToolType>(null);

  if (activeTool === 'pomodoro') {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
          <button
            onClick={() => setActiveTool(null)}
            className="flex items-center gap-2 text-gray-400 hover:text-black transition-colors text-xs font-black uppercase tracking-widest"
          >
            <span className="text-xl">←</span> Return to Hub
          </button>
          <div className="flex items-center gap-2">
            <TimerIcon className="w-4 h-4 text-black" />
            <span className="text-xs font-black uppercase tracking-widest text-gray-600">Focus Engine</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PomodoroTimer courses={courses} enrolledCourseIds={enrolledCourseIds} />
        </div>
      </div>
    );
  }

  if (activeTool === 'feynman') {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
          <button
            onClick={() => setActiveTool(null)}
            className="flex items-center gap-2 text-gray-400 hover:text-black transition-colors text-xs font-black uppercase tracking-widest"
          >
            <span className="text-xl">←</span> Return to Hub
          </button>
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-black" />
            <span className="text-xs font-black uppercase tracking-widest text-gray-600">Feynman Lab</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FeynmanTechnique courses={courses} enrolledCourseIds={enrolledCourseIds} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto p-8 md:p-12 space-y-12">
        {/* Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <BoltIcon className="w-3 h-3 text-black" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Cognitive Arsenal</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-black italic tracking-tighter uppercase leading-[0.9]">
            Study <span className="text-gray-400">Suite</span>
          </h1>
          <p className="text-gray-500 text-sm max-w-xl font-medium leading-relaxed">
            Enhance your cognitive performance with professional-grade learning instruments.
            Choose a module below to begin your optimization session.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pomodoro Card */}
          <button
            onClick={() => setActiveTool('pomodoro')}
            className="group relative h-[400px] bg-white border border-gray-200 rounded-[2.5rem] overflow-hidden text-left transition-all duration-500 hover:border-black hover:shadow-xl"
          >
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative h-full p-10 flex flex-col">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 group-hover:scale-110 group-hover:bg-black group-hover:border-black transition-all duration-500">
                <TimerIcon className="w-8 h-8 text-gray-400 group-hover:text-white group-hover:rotate-12 transition-all" />
              </div>

              <div className="mt-auto space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-black/50 uppercase tracking-widest">Deep Focus</p>
                  <h3 className="text-3xl font-black text-black uppercase italic tracking-tight">Focus Engine</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed group-hover:text-black transition-colors">
                  Utilize advanced Pomodoro cycles to achieve deep focus. Track progress and eliminate distractions in optimized intervals.
                </p>
                <div className="pt-4 flex items-center gap-2 text-black font-black uppercase text-[10px] tracking-widest opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all">
                  Initialize Session <span className="text-lg">→</span>
                </div>
              </div>
            </div>

            <div className="absolute top-10 right-10 w-32 h-32 bg-black/[0.02] blur-[60px] rounded-full group-hover:bg-black/10 transition-colors" />
          </button>

          {/* Feynman Technique Card */}
          <button
            onClick={() => setActiveTool('feynman')}
            className="group relative h-[400px] bg-white border border-gray-200 rounded-[2.5rem] overflow-hidden text-left transition-all duration-500 hover:border-black hover:shadow-xl"
          >
            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative h-full p-10 flex flex-col">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 group-hover:scale-110 group-hover:bg-black group-hover:border-black transition-all duration-500">
                <BookOpenIcon className="w-8 h-8 text-gray-400 group-hover:text-white group-hover:-rotate-12 transition-all" />
              </div>

              <div className="mt-auto space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-black/50 uppercase tracking-widest">Concept Mastery</p>
                  <h3 className="text-3xl font-black text-black uppercase italic tracking-tight">Feynman Lab</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed group-hover:text-black transition-colors">
                  Master complex subjects by explaining them in simple terms. Identify knowledge gaps and refine your conceptual understanding.
                </p>
                <div className="pt-4 flex items-center gap-2 text-black font-black uppercase text-[10px] tracking-widest opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all">
                  Enter Laboratory <span className="text-lg">→</span>
                </div>
              </div>
            </div>

            <div className="absolute top-10 right-10 w-32 h-32 bg-black/[0.02] blur-[60px] rounded-full group-hover:bg-black/10 transition-colors" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="relative p-8 bg-gray-50 border border-gray-200 rounded-[2rem] overflow-hidden">
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-gray-200">
              <SparklesIcon className="w-6 h-6 text-black" />
            </div>
            <div className="space-y-1">
              <h4 className="text-black font-black uppercase italic tracking-tight">Neural Optimization Active</h4>
              <p className="text-gray-500 text-xs font-medium">Lumo AI is continuously analyzing your learning patterns to suggest the best technique for your current workload.</p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-black/5 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export default StudyTools;
