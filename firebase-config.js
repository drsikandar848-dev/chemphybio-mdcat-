
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBhygsn584HpW-gBzmUUWgeWExs_zd7h3A",
  authDomain: "chemphybio-mdcat.firebaseapp.com",
  projectId: "chemphybio-mdcat",
  storageBucket: "chemphybio-mdcat.firebasestorage.app",
  messagingSenderId: "676636518468",
  appId: "1:676636518468:web:9cca41e43cfb28a46f3411"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
