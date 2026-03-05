import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkSessions() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        const sessions = await db.collection('sessions').find({}).toArray();
        console.log(`Sessions count: ${sessions.length}`);

        for (const s of sessions) {
            const user = await db.collection('users').findOne({ _id: s.userId });
            console.log(`Session ${s.token.substr(0, 10)}... -> User: ${user ? user.username || user.name : 'UNKNOWN'} (${user?.role})`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkSessions();
