const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

let firebaseInitialized = false;

if (!admin.apps.length) {
    try {
        let serviceAccount;
        
        // Try individual env vars first (Railway/production - easier than JSON)
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
            console.log('Initializing Firebase with individual environment variables');
            serviceAccount = {
                type: 'service_account',
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL
            };
        }
        // Try FIREBASE_CREDENTIALS_JSON (backup method)
        else if (process.env.FIREBASE_CREDENTIALS_JSON) {
            console.log('Initializing Firebase with FIREBASE_CREDENTIALS_JSON');
            serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
        } 
        // Fallback to service account file (local development)
        else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            console.log('Initializing Firebase with service account file');
            const absolutePath = path.resolve(__dirname, '..', '..', process.env.GOOGLE_APPLICATION_CREDENTIALS);
            serviceAccount = require(absolutePath);
        } 
        else {
            throw new Error('No Firebase configuration found. Please set either FIREBASE_PROJECT_ID/FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL or FIREBASE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        
        firebaseInitialized = true;
        console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error.message);
        console.error('Firebase authentication will be disabled.');
        firebaseInitialized = false;
    }
} else {
    console.log('Firebase Admin SDK already initialized.');
    firebaseInitialized = true;
}

// Export both admin and initialization status
module.exports = admin;
module.exports.isInitialized = () => firebaseInitialized;
