const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    if (process.env.VITE_FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        // For production, you usually need service account credentials in process.env
        // But for some setups, projectId is enough if it's running in a trusted GCP environment.
        // Assuming the user has configured this in Vercel.
      });
      console.log('Firebase Admin initialized');
    }
  } catch (error) {
    console.error('Firebase Admin init error:', error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

module.exports = { admin, db };
