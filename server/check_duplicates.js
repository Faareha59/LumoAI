import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkDuplicates() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        const users = await db.collection('users').find({ $or: [{ name: 'h' }, { username: 'h' }] }).toArray();
        console.log('Users matching "h":', JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkDuplicates();
