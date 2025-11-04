import React from 'react';
import PomodoroTimer from './PomodoroTimer';
import { TimerIcon } from '../Icons';

const StudyTools: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <TimerIcon className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-3xl font-bold">Study Tools</h1>
        </div>
        <div className="grid grid-cols-1">
            <PomodoroTimer />
        </div>
      </div>
    </div>
  );
};

export default StudyTools;