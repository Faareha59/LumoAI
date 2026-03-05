import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'Lumo_AI';

async function fixMaterialFileIds() {
    console.log('🔧 Starting migration to fix material fileIds...');

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    const materialsBucket = new GridFSBucket(db, { bucketName: 'materials' });

    // Get all materials with null or missing fileId
    const materials = await db.collection('materials').find({
        $or: [
            { fileId: null },
            { fileId: { $exists: false } }
        ]
    }).toArray();

    console.log(`📋 Found ${materials.length} materials with missing fileId`);

    if (materials.length === 0) {
        console.log('✅ No materials to fix!');
        await client.close();
        return;
    }

    let fixed = 0;
    let notFound = 0;

    for (const material of materials) {
        console.log(`\n🔍 Processing material: ${material._id} - "${material.title}"`);
        console.log(`   CourseId: ${material.courseId}, ModuleId: ${material.moduleId}`);

        // Try to find the file in GridFS by metadata (courseId and moduleId)
        const files = await materialsBucket.find({
            'metadata.courseId': material.courseId,
            'metadata.moduleId': material.moduleId
        }).toArray();

        console.log(`   Found ${files.length} files with matching courseId/moduleId`);

        if (files.length === 0) {
            console.log(`  ⚠️  No matching file found in GridFS`);
            notFound++;
            continue;
        }

        // Try to match by title
        let file = files.find(f => f.metadata?.title === material.title || f.filename === material.title);

        if (!file && files.length > 0) {
            console.log(`  ⚠️  No exact title match, using most recent file`);
            file = files.sort((a, b) => b.uploadDate - a.uploadDate)[0];
        }

        if (!file) {
            console.log(`  ⚠️  Could not determine which file to use`);
            notFound++;
            continue;
        }

        console.log(`  ✅ Found file in GridFS: ${file._id} (${file.filename})`);

        // Update the material with the fileId
        await db.collection('materials').updateOne(
            { _id: material._id },
            { $set: { fileId: file._id } }
        );

        console.log(`  ✅ Updated material with fileId: ${file._id}`);
        fixed++;
    }

    console.log(`\n📊 Migration complete!`);
    console.log(`  ✅ Fixed: ${fixed}`);
    console.log(`  ⚠️  Not found: ${notFound}`);

    await client.close();
}

fixMaterialFileIds().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
