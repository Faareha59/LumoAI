import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkEmails() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        const users = await db.collection('users').find({ $or: [{ name: 'j' }, { name: 'h' }] }).toArray();
        console.log('Users:');
        users.forEach(u => console.log(`- Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, ID: ${u._id}`));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkEmails();
