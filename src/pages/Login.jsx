import { useEffect, useState } from 'react'
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'

export default function Login() {
  const [err, setErr] = useState('')
  useEffect(() => { getRedirectResult(auth).catch((e) => setErr(e.code || e.message)) }, [])
  const login = async () => {
    setErr('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider)
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setErr(e.code || e.message)
      }
    }
  }
  return (
    <div className="splash login">
      <div className="logo">☕</div>
      <h1>出攤記帳</h1>
      <p className="muted">展場銷售・庫存・零錢對帳</p>
      <button className="primary big" onClick={login}>使用 Google 帳號登入</button>
      {err && <p className="warn">登入失敗：{err}</p>}
    </div>
  )
}
