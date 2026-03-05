import { MongoClient } from 'mongodb';

const uri = 'mongodb://127.0.0.1:27017/Lumo_AI';

async function checkUserJ() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();

        // Check for user 'j'
        let user = await db.collection('users').findOne({ name: 'j' });
        if (!user) user = await db.collection('users').findOne({ username: 'j' });

        if (user) {
            console.log('Found user "j":');
            console.log(JSON.stringify(user, null, 2));
        } else {
            console.log('User "j" not found.');
            // Dump all users again just in case
            const all = await db.collection('users').find({}).toArray();
            console.log('Available users:', all.map(u => ({ name: u.name, username: u.username, role: u.role })));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkUserJ();
