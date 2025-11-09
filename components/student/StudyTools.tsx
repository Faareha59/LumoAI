import React from 'react';
import PomodoroTimer from './PomodoroTimer';
import { TimerIcon } from '../Icons';
import type { Course } from '../../types';

interface Props {
  courses: Course[];
  enrolledCourseIds: string[];
}

const StudyTools: React.FC<Props> = ({ courses, enrolledCourseIds }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <TimerIcon className="w-8 h-8 text-muted-foreground" />
          <h1 className="text-3xl font-bold">Study Tools</h1>
        </div>

        <div className="grid grid-cols-1">
          <PomodoroTimer courses={courses} enrolledCourseIds={enrolledCourseIds} />
        </div>
      </div>
    </div>
  );
};

export default StudyTools;