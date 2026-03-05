
import { MongoClient, ObjectId } from 'mongodb';

async function check() {
    const uri = 'mongodb://127.0.0.1:27017';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('project');
        const p = await db.collection('projects').find({}).toArray();
        console.log('Project Count:', p.length);
        p.forEach(proj => {
            console.log(`- ID: ${proj._id}, Type: ${typeof proj._id}, Title: ${proj.title}`);
            if (proj.collaborators) {
                console.log(`  Collaborators: ${JSON.stringify(proj.collaborators)}`);
            }
        });
    } catch (e) { console.error(e); }
    finally { await client.close(); }
}

check();
