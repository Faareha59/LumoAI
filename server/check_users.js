import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkUsers() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        const users = await db.collection('users').find({}).toArray();
        console.log('Users found:', users.length);
        users.forEach(u => {
            console.log(`- User: ${u.username}, Role: ${u.role}, ID: ${u._id}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkUsers();
