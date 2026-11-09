// Paste your Firebase web config here (public by design).
// While projectId starts with "demo-", the game talks to the local Firebase emulator instead.
export const firebaseConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo-physicalracing.firebaseapp.com',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-physicalracing',
  projectId: 'demo-physicalracing',
  appId: 'demo-app',
};

export const useEmulator = firebaseConfig.projectId.startsWith('demo-');
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
