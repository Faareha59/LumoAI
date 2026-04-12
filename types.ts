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
    | 'pdf_explainer'
    | 'lumo_meeting'
    | 'marketplace'
    | 'my_exercises';

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
}

// Represents a generated outline for a module, used during course creation.
export interface ModuleOutline {
    title: string;
    description: string;
    topics?: string[];
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
    id: string;
    title: string;
    summary: string;
    slides: Slide[];
    quiz: QuizQuestion[];
    pdfDocumentBase64?: string;
    pdfId?: string; // GridFS ID for uploaded PDF
}

// A module within a course, which contains lectures.
export interface CourseModule {
    id: string;
    title: string;
    description: string;
    lectures: VideoDraft[];
    topics?: string[];
    topicOutlines?: Record<string, string>; // Mapping of topic title to its detailed outline
    materialIds?: Record<string, string>; // Mapping of topic/lecture title to GridFS ID
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

export interface SkillSwap {
    _id: string;
    title: string; // The skill being sought
    offering: string; // The skill being offered
    description: string;
    sharedPlan?: string; // Collaborative learning plan
    messages?: {
        senderId: string;
        senderName: string;
        text: string;
        createdAt: string;
    }[];
    creatorId: string;
    creatorName: string;
    freelancerId?: string;
    freelancerName?: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'DISPUTED';
    submissionText?: string;
    aiVerdict?: {
        approved: boolean;
        score: number;
        reason: string;
    };
    createdAt: string;
}

export interface Collaborator {
    userId: string;
    name: string;
    role: 'owner' | 'member';
}

export interface ProjectFile {
    name: string;
    content: string;
    lastUpdated?: string;
}

export interface Project {
    _id: string;
    title: string;
    description?: string;
    repoUrl?: string;
    files?: ProjectFile[];
    packages?: string[]; // e.g. ["numpy", "react-router-dom"]
    terminalLogs?: string[];
    ownerId: string;
    ownerName: string;
    collaborators: Collaborator[];
    createdAt: string;
    lastUpdated?: string;
}

export interface ProjectInvite {
    _id: string;
    projectId: string;
    projectTitle: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
}
