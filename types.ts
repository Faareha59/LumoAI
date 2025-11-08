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
  | 'student_courses'
  | 'student_videos'
  | 'lecture_viewer'
  | 'chatbot'
  | 'study_tools'
  | 'coding_game'
  | 'teacher_dashboard'
  | 'video_generator'
  | 'pdf_explainer';

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
    heading?: string;
    visualTheme?: string;
    keywords?: string[];
    codeSnippet?: string;
    snippetLanguage?: string;
    pdfExcerpt?: string;
    pdfPage?: number;
    voiceover?: string;
}

// Represents a single video lecture.
export interface VideoDraft {
    id:string;
    title: string;
    summary: string;
    slides: Slide[];
    quiz: QuizQuestion[];
    pdfDocumentBase64?: string;
}

// A module within a course, which contains lectures.
export interface CourseModule {
    id: string;
    title: string;
    description: string;
    lectures: VideoDraft[];
    topics?: string[];
}

// The top-level structure for a subject.
export interface Course {
    id: string;
    title: string; // The subject
    description?: string;
    creatorId?: string;
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
