import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama3-8b-8192',
        'mixtral-8x7b-32768'
    ];

    for (const model of models) {
        console.log(`--- Testing ${model} ---`);
        try {
            await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'hi' }],
                model: model
            });
            console.log(`[PASS] ${model}`);
        } catch (e) {
            console.log(`[FAIL] ${model}: ${e.message}`);
        }
    }
}

test();
