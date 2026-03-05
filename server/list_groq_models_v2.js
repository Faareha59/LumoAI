import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function listModels() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    try {
        const list = await groq.models.list();
        console.log('Available Models matching "llama":');
        list.data.forEach(m => {
            if (m.id.toLowerCase().includes('llama')) {
                console.log(` - ${m.id}`);
            }
        });
    } catch (e) {
        console.error('Failed to list models:', e);
    }
}

listModels();
