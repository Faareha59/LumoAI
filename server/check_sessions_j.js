import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkSessionsJ() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        const user = await db.collection('users').findOne({ name: 'j' });
        if (!user) { console.log('User j not found'); return; }

        const sessions = await db.collection('sessions').find({ userId: user._id }).sort({ createdAt: -1 }).limit(5).toArray();
        console.log(`Recent sessions for j (${user._id}):`);
        sessions.forEach(s => console.log(` - Token: ${s.token.substr(0, 10)}... Created: ${s.createdAt}`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkSessionsJ();
