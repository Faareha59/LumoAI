
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
console.log('Key exists:', !!key);

try {
    const ai = new GoogleGenAI({ apiKey: key });
    console.log('Class instance:', ai.constructor.name);
    console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(ai)));

    // Test getGenerativeModel
    if (typeof ai.getGenerativeModel === 'function') {
        console.log('getGenerativeModel found!');
    } else {
        console.log('getGenerativeModel NOT found.');
        // Try other common names
        const allProps = [...Object.getOwnPropertyNames(ai), ...Object.getOwnPropertyNames(Object.getPrototypeOf(ai))];
        console.log('All available properties:', allProps);
    }
} catch (e) {
    console.error('Test failed:', e);
}
