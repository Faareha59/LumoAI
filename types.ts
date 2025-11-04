// types.ts
export enum Role {
    Student = 'student',
    Teacher = 'teacher',
}

export interface User {
    id: string;
    name: string;
    role: Role;
}

export type AppView =
  | 'student_dashboard'
  | 'lecture_viewer'
  | 'chatbot'
  | 'study_tools'
  | 'coding_game'
  | 'teacher_dashboard'
  | 'video_generator';

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
}

// Represents a generated outline for a module, used during course creation.
export interface ModuleOutline {
    title: string;
    description: string;
}

// Represents a slide within a lecture.
export interface Slide {
    description: string; 
    imagePrompt: string; 
    imageUrl?: string;
    audioUrl?: string;
}

// Represents a single video lecture.
export interface VideoDraft {
    id:string;
    title: string;
    summary: string;
    slides: Slide[];
    quiz: QuizQuestion[];
}

// A module within a course, which contains lectures.
export interface CourseModule {
    id: string;
    title: string;
    description: string;
    lectures: VideoDraft[];
}

// The top-level structure for a subject.
export interface Course {
    id: string;
    title: string; // The subject
    modules: CourseModule[];
}


export interface QuizAnalytics {
    lectureId: string;
    lectureTitle: string;
    completions: number;
    averageScore: number;
}

export interface StudentQuestion {
    id: string;
    studentName: string;
    lectureTitle: string;
    question: string;
}
