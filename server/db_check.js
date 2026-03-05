
import { MongoClient } from 'mongodb';

async function checkDb() {
    const uri = 'mongodb://127.0.0.1:27017';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log('--- MongoDB Info ---');
        const admin = client.db().admin();
        const dbs = await admin.listDatabases();
        console.log('Available Databases:', dbs.databases.map(d => d.name).join(', '));

        const db = client.db('Lumo_AI');
        const projects = await db.collection('projects').find({}).toArray();
        console.log(`Found ${projects.length} projects in Lumo_AI`);
        projects.forEach(p => {
            console.log(`- ID: ${p._id}, Title: ${p.title}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        const closed = await client.close();
    }
}

checkDb();
