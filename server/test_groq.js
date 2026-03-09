import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

async function test() {
    try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('Testing Groq connection...');

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'Return valid JSON: {"status": "ok"}' }],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' }
        });

        console.log('Response:', chatCompletion.choices[0]?.message?.content);
        console.log('Success!');
    } catch (e) {
        console.error('Groq Error:', e);
    }
}

test();
