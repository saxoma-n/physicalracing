// Paste your Firebase web config here (public by design).
// While projectId starts with "demo-", the game talks to the local Firebase emulator instead.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyAhTcAnEJmFQ7XuFhncbprkbFBWgEAJdag",
  authDomain: "physical-racing.firebaseapp.com",
  projectId: "physical-racing",
  storageBucket: "physical-racing.firebasestorage.app",
  messagingSenderId: "870162717257",
  appId: "1:870162717257:web:83ded07eeb8ecad23d7d98",
  measurementId: "G-RPEYKZ8YJ9",
  databaseURL: "https://physical-racing-default-rtdb.firebaseio.com/"
};

export const useEmulator = firebaseConfig.projectId.startsWith('demo-');
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
