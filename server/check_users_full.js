import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkUsers() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        // Find user with name 'h' or just dump all with limit
        const users = await db.collection('users').find({}).limit(50).toArray();
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkUsers();
