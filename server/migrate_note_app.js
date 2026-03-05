
import { MongoClient, ObjectId } from 'mongodb';

async function migrate() {
    const uri = 'mongodb://127.0.0.1:27017';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('project');
        const id = new ObjectId('69a5c2e49c944361c91e9f01');
        const title = 'NoteTaking Website';
        const result = await db.collection('projects').updateOne(
            { _id: id },
            {
                $set: {
                    files: [
                        { name: 'README.md', content: `# ${title}\n\nProject started with Lumo Studio.` },
                        { name: 'index.html', content: `<!DOCTYPE html>\n<html>\n<head><title>${title}</title></head>\n<body>\n  <h1>My Note Taking App</h1>\n  <div id="app"></div>\n</body>\n</html>` },
                        { name: 'App.js', content: `console.log("Initializing ${title}...");\n\nconst notes = [];\nfunction addNote(text) {\n  notes.push(text);\n  console.log("Added note:", text);\n}` },
                        { name: 'package.json', content: JSON.stringify({ name: 'note-taking-app', version: '1.0.0', dependencies: { 'lumoai': 'latest', 'express': 'latest' } }, null, 2) }
                    ],
                    packages: ['lumoai', 'express']
                }
            }
        );
        console.log(`Migrated ${result.modifiedCount} project.`);
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

migrate();
