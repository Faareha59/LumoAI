import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const model = 'llama-3.3-70b-versatile';

    console.log(`Testing ${model}...`);
    try {
        await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'hi' }],
            model: model
        });
        console.log('SUCCESS');
    } catch (e) {
        console.log('FAILED:', e.message);
    }
}

test();
