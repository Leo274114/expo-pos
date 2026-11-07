import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { firebaseConfig, isConfigured } from './firebase-config.js'

export const app = isConfigured ? initializeApp(firebaseConfig) : null

// 離線暫存：斷網時照樣能讀寫，恢復連線後自動同步
export const db = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null

export const auth = app ? getAuth(app) : null
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
