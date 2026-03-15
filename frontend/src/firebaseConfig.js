import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value.trim() !== ""
);

let auth = null;
let googleProvider = null;
let db = null;

if (hasFirebaseConfig) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope("email");
    googleProvider.addScope("profile");
    googleProvider.setCustomParameters({
        prompt: "select_account"
    });
    db = getFirestore(app);
} else {
    console.warn(
        "Firebase is not configured. Set VITE_FIREBASE_* variables to enable login and liked songs."
    );
}

export { auth, googleProvider, db, hasFirebaseConfig };
