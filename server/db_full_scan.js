
import { MongoClient } from 'mongodb';
import fs from 'fs';

async function checkDb() {
    const uri = 'mongodb://127.0.0.1:27017';
    const client = new MongoClient(uri);
    const log = [];
    try {
        await client.connect();
        const admin = client.db().admin();
        const dblist = await admin.listDatabases();
        const dbNames = dblist.databases.map(d => d.name);
        log.push('Available DBs: ' + dbNames.join(', '));

        for (const name of dbNames) {
            if (['admin', 'config', 'local'].includes(name)) continue;
            const db = client.db(name);
            const collections = await db.listCollections().toArray();
            log.push(`\nDB: ${name}`);
            for (const col of collections) {
                const count = await db.collection(col.name).countDocuments();
                log.push(`  - ${col.name}: ${count} docs`);
                if (col.name === 'projects' && count > 0) {
                    const projects = await db.collection('projects').find({}).toArray();
                    projects.forEach(p => log.push(`    - ID: ${p._id}, Title: ${p.title}`));
                }
            }
        }
    } catch (err) {
        log.push('Error: ' + err.message);
    } finally {
        fs.writeFileSync('db_report.txt', log.join('\n'));
        await client.close();
    }
}

checkDb();
