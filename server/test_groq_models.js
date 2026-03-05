import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function test() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // List of probable models
    const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.2-90b-vision-preview',
        'mixtral-8x7b-32768',
        'gemma-7b-it'
    ];

    for (const model of models) {
        console.log(`Testing model: ${model}...`);
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'Return {"status": "ok"}' }],
                model: model,
                response_format: { type: 'json_object' }
            });
            console.log(`SUCCESS: ${model}`);
            console.log(chatCompletion.choices[0]?.message?.content);
            return; // Found a working one
        } catch (e) {
            console.log(`FAILED: ${model} -> ${e.error?.code || e.message}`);
        }
    }
}

test();
