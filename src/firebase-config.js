// Firebase 專案設定（這些值本來就會出現在網頁中，不是密碼；資料安全靠 firestore.rules 把關）
export const firebaseConfig = {
  apiKey: 'AIzaSyCVNWIaKQFzBYOlZlqco8fvdZeKYPG39Zg',
  authDomain: 'expo-pos-22c94.firebaseapp.com',
  projectId: 'expo-pos-22c94',
  storageBucket: 'expo-pos-22c94.firebasestorage.app',
  messagingSenderId: '1049920258449',
  appId: '1:1049920258449:web:1c4f5151d8c7bcdb5e5a30'
}

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('請')
