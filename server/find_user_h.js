import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function findUserH() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        let user = await db.collection('users').findOne({ name: 'h' });
        if (!user) user = await db.collection('users').findOne({ username: 'h' });

        if (user) {
            console.log('Found user "h":');
            console.log(JSON.stringify(user, null, 2));
        } else {
            console.log('User "h" not found.');
            const all = await db.collection('users').find({}).toArray();
            console.log('All Users:', all.map(u => ({ id: u._id, name: u.name, username: u.username, role: u.role })));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

findUserH();
