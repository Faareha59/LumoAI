import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkSessionsH() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        // Find user h
        const user = await db.collection('users').findOne({ name: 'h' });
        if (!user) { console.log('User h not found'); return; }

        console.log(`User h: ${user._id} (${user.role})`);

        const sessions = await db.collection('sessions').find({ userId: user._id }).toArray();
        console.log(`Sessions for h: ${sessions.length}`);
        sessions.forEach(s => console.log(` - Token: ${s.token.substr(0, 10)}...`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkSessionsH();
