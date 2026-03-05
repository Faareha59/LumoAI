import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    console.log('Testing Groq with llama-3.3-70b-versatile...');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'Say hello' }],
            model: 'llama-3.3-70b-versatile',
        });
        console.log('Response:', chatCompletion.choices[0]?.message?.content);
        console.log('SUCCESS');
    } catch (e) {
        console.error('FAILED:', e.message);
    }
}

test();
