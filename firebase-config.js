/*
  FIREBASE SETUP:
  1. Create a project at https://console.firebase.google.com/
  2. Add a Web App and copy its Firebase config into the object below.
  3. Enable Authentication > Email/Password.
  4. Create a Cloud Firestore database.
  5. Publish firestore.rules from this project.
  Do not put service-account/private keys in frontend files.
*/
const firebaseConfig = {
  apiKey: "AIzaSyDpot5YRJpW1l6qGWtNl5YE0nhDUENVdzQ",
  authDomain: "college-portal-695c0.firebaseapp.com",
  databaseURL: "https://college-portal-695c0-default-rtdb.firebaseio.com",
  projectId: "college-portal-695c0",
  storageBucket: "college-portal-695c0.firebasestorage.app",
  messagingSenderId: "557644866574",
  appId: "1:557644866574:web:b6bad6548c60128ffe085f"
};

window.FIREBASE_CONFIG = firebaseConfig;