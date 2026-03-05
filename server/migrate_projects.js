
import { MongoClient } from 'mongodb';

async function migrate() {
    const uri = 'mongodb://127.0.0.1:27017';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('project');
        const result = await db.collection('projects').updateMany(
            { repoUrl: { $exists: false } },
            { $set: { repoUrl: "", files: [], packages: [], terminalLogs: ["[SYSTEM] Migrated and initialized for Lumo Studio."] } }
        );
        console.log(`Migrated ${result.modifiedCount} projects.`);
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

migrate();
