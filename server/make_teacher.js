import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function makeTeacher() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        const res = await db.collection('users').updateOne(
            { name: 'h' },
            { $set: { role: 'teacher' } }
        );

        console.log('Update result:', res);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

makeTeacher();
