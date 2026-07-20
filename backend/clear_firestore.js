const admin = require('./config/firebase');

const db = admin.firestore();

async function deleteAllData() {
    const collections = ['athletes', 'races', 'results', 'teams', 'users'];

    for (const collectionName of collections) {
        const collectionRef = db.collection(collectionName);
        const snapshot = await collectionRef.get();

        if (snapshot.empty) {
            console.log(`Collection '${collectionName}' is already empty.`);
            continue;
        }

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`All documents in collection '${collectionName}' have been deleted.`);
    }
}

deleteAllData().then(() => {
    console.log('All specified collections have been cleared.');
    process.exit(0);
}).catch(error => {
    console.error('Error clearing collections:', error);
    process.exit(1);
});
