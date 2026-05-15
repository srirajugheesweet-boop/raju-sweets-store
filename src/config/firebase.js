import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmIVRd12yIfVpp50-i6U8onTC47GaSf8g",
  authDomain: "raju-sweets-25c70.firebaseapp.com",
  projectId: "raju-sweets-25c70",
  storageBucket: "raju-sweets-25c70.firebasestorage.app",
  messagingSenderId: "408294951795",
  appId: "1:408294951795:web:3bd1157026c4e46f601306",
  measurementId: "G-BRM14BSV5X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
