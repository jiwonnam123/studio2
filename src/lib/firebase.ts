// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Your web app's Firebase configuration
// IMPORTANT: Populate these from your Firebase project console into your .env file
const firebaseConfig = {
  apiKey: "AIzaSyC6VzyaKnCju0BXPbH0Y8eiv2YZIKKfPVQ",
  authDomain: "formflow-tn7d6.firebaseapp.com",
  projectId: "formflow-tn7d6",
  storageBucket: "formflow-tn7d6.firebasestorage.app",
  messagingSenderId: "766776155443",
  appId: "1:766776155443:web:36a967d318c49cf5dd3246"
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const firestore: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, firestore, storage };
