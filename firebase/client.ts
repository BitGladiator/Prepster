import { initializeApp, getApp, getApps} from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyDnUx3vYPRHtaEiU8d0fp-yhMbJI4Od9h4",
  authDomain: "prepster-c0eed.firebaseapp.com",
  projectId: "prepster-c0eed",
  storageBucket: "prepster-c0eed.firebasestorage.app",
  messagingSenderId: "352831746298",
  appId: "1:352831746298:web:84d69733a96768cb869943",
  measurementId: "G-PH1W1NBDDH"
};

// Initialize Firebase
const app = !getApps.length ? initializeApp(firebaseConfig):getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);