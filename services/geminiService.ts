import { GoogleGenAI, Chat, Type, GenerateContentResponse, Modality } from "@google/genai";
import { QuizQuestion, Slide, ModuleOutline } from '../types';
import { createAudioUrlFromBase64 } from './audioUtils';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
let chat: Chat;


interface DraftContentsResponse {
    title: string;
    summary: string;
    slides: { description: string; imagePrompt: string; }[];
    quiz: QuizQuestion[];
}


const delay = (ms: number) => new Promise(res => setTimeout(res, ms));


export const startChat = () => {
  chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: "You are Lumo, a friendly and helpful AI study assistant for a learning platform. Keep your answers concise and focused on educational topics. When asked about non-academic subjects, politely steer the conversation back to learning."
    }
  });
};

export const generateImagesForSlidesViaPexels = async (
    slides: Slide[],
): Promise<string[]> => {
    const results: string[] = [];
    for (const slide of slides) {
        const queryBase = slide.imagePrompt?.trim() || '';
        
        const query = queryBase || 'computer science diagram';
        try {
            const resp = await fetch('/api/pexels-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            if (!resp.ok) throw new Error('bad status');
            const data = await resp.json();
            results.push(data?.url || '');
        } catch (e) {
            results.push('');
        }
        
        await delay(200);
    }
    return results;
};

export const sendMessageToChatbot = async (message: string): Promise<string> => {
  if (!chat) {
    startChat();
  }
  try {
    const response: GenerateContentResponse = await chat.sendMessage({ message });
    return response.text;
  } catch (error) {
    console.error("Error sending message to chatbot:", error);
    throw new Error("Failed to get a a response from the AI assistant.");
  }
};

export const generateCourseModules = async (subject: string): Promise<ModuleOutline[]> => {
    const model = 'gemini-2.5-flash';
    const prompt = `You are an expert curriculum designer for university-level Computer Science. A teacher wants to create a course on the subject: "${subject}".
    Propose a logical structure for this course by breaking it down into 5 to 7 distinct modules.
    For each module, provide a concise title and a one-sentence description of its content.
    Return the result as a single JSON object with a key "modules" which is an array of module objects. Each module object must have "title" and "description" properties.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        modules: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ["title", "description"]
                            }
                        }
                    },
                    required: ["modules"]
                }
            }
        });
        const jsonText = response.text.trim();
        const outlineData = JSON.parse(jsonText);
        
        if (!outlineData.modules) {
             throw new Error("AI response did not contain a valid module outline.");
        }
        return outlineData.modules;
    } catch (error) {
        console.error("Error generating course modules:", error);
        throw new Error("Failed to generate the course modules.");
    }
};



export const generateLectureForModule = async (courseTitle: string, module: ModuleOutline): Promise<DraftContentsResponse> => {
    const model = 'gemini-2.5-flash'; 

    const prompt = `You are an expert in Computer Science education. Create the content for a single, focused video lecture.
    This lecture is part of a larger university-level course titled "${courseTitle}".
    The specific module for this lecture is: "${module.title} - ${module.description}".

    The final output should be a slideshow with audio. Create exactly 20 slides that cover the key concepts of this module. Each slide's description should flow smoothly into the next.
    
    Provide the following in a single JSON object:
    1.  "title": A concise and academic title for this specific lecture (e.g., "Introduction to ${module.title}").
    2.  "summary": A brief one or two-sentence summary of this lecture's content.
    3.  "slides": An array of exactly 20 slide objects. Each slide object must have:
        - "description": A short, focused paragraph (2-4 sentences) of narration for the slide.
        - "imagePrompt": A comma-separated list of 2-3 simple, SFW keywords for finding a relevant stock photo (e.g., "binary code, computer screen", "networking, server room", "algorithm, flowchart").
    4.  "quiz": An array of exactly 10 multiple-choice quiz questions based on this lecture's slide content. Each question object must have "question", "options" (an array of 4), and "correctAnswer".`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        slides: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    imagePrompt: { type: Type.STRING },
                                },
                                required: ["description", "imagePrompt"],
                            }
                        },
                        quiz: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    options: {
                                        type: Type.ARRAY,
                                        items: { type: Type.STRING }
                                    },
                                    correctAnswer: { type: Type.STRING },
                                },
                                required: ["question", "options", "correctAnswer"],
                            }
                        },
                    },
                    required: ["title", "summary", "slides", "quiz"],
                },
            }
        });
        
        const jsonText = response.text.trim();
        const draftData = JSON.parse(jsonText);

        if (!draftData.title || !draftData.slides || !draftData.quiz) {
            throw new Error("AI response is missing required fields.");
        }
        
        return draftData;
    } catch (error) {
        console.error("Error generating video draft contents:", error);
        throw new Error("Failed to generate the video contents.");
    }
};

/**
 * Generates image URLs for slides using a free, reliable stock photo service.
 * This avoids the need for a billing-enabled API key and is more reliable.
 * @param slides The slides array, each with an imagePrompt.
 * @returns An array of fully-formed image URLs.
 */
export const generateImagesForSlides = (slides: Slide[]): string[] => {
    return slides.map(slide => {
        // Clean up the prompt to be URL-safe keywords
        const keywords = slide.imagePrompt
            .split(',')
            .map(kw => kw.trim().replace(/\s+/g, '-')) // Replace spaces with dashes
            .filter(Boolean) // Remove any empty keywords
            .join(',');

        if (!keywords) {
            // Provide a default if keywords are empty
            return `https://source.unsplash.com/1600x900/?technology`;
        }
        
        // Use Unsplash Source to get a random image based on keywords
        return `https://source.unsplash.com/1600x900/?${keywords}`;
    });
};


export const generateImagesForSlidesViaOpenRouter = async (
    slides: Slide[],
    options?: { model?: string; size?: string }
): Promise<string[]> => {
    const model = options?.model || (process.env.OPENROUTER_IMAGE_MODEL as string) || 'flux/dev';
    const size = options?.size || '1280x720';
    const results: string[] = [];
    for (const slide of slides) {
        const promptBase = slide.imagePrompt?.trim() || '';
        const prompt = promptBase || 'technology diagram, computer science';
        try {
            const resp = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model, size }),
            });
            if (!resp.ok) throw new Error('bad status');
            const data = await resp.json();
            results.push(data?.url || '');
        } catch (e) {
            results.push('');
        }
    }
    return results;
};


/**
 * Generates an individual audio track for each slide sequentially to avoid rate limiting.
 * @param slides The array of slides to generate audio for.
 * @param onProgress A callback to report the progress of audio generation.
 * @returns An array of audio blob URLs.
 */
export const generateAudioForSlides = async (
    slides: Slide[], 
    onProgress: (current: number, total: number) => void
): Promise<string[]> => {
    const audioUrls: string[] = [];
    let slideIndex = 0;
    let hitGlobalRateLimit = false;
    for (const slide of slides) {
        slideIndex++;
        onProgress(slideIndex, slides.length);

        if (!slide.description) {
            audioUrls.push("");
            continue;
        }

        if (hitGlobalRateLimit) {
            audioUrls.push("");
            continue;
        }

        let success = false;
        let attempts = 0;
        while (!success && attempts < 3) {
            attempts++;
            try {
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: `Say clearly and engagingly: ${slide.description}` }] }],
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                        },
                    },
                });
                const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (!base64Audio) throw new Error("No audio data in response.");
                audioUrls.push(createAudioUrlFromBase64(base64Audio));
                success = true;
            } catch (error: any) {
                const msg = String(error?.message || error || '');
                const isRateLimited = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
                if (isRateLimited && attempts < 3) {
                    const m = msg.match(/retryDelay\"?:\"?(\d+)s/);
                    const waitSec = m ? parseInt(m[1], 10) : 20;
                    await delay(waitSec * 1000);
                    continue;
                }
                console.error(`Error generating audio for slide ${slideIndex}:`, error);
                audioUrls.push("");
                if (isRateLimited) {
                    
                    hitGlobalRateLimit = true;
                }
                break;
            }
        }
        await delay(5000); 
    }

    return audioUrls;
};
