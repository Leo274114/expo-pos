import { useEffect, useState } from 'react'
import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'
import { VERSION } from '../version.js'

// LINE、Facebook、Instagram 等 App 內建瀏覽器：Google 不允許在裡面登入（畫面會一片白或顯示 403）
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const inApp = /Line\/|FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|Threads|TikTok|musical_ly/i.test(UA)
const isLine = /Line\//i.test(UA)
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)
const cleanUrl = () => location.origin + location.pathname
// LINE 支援在網址加 openExternalBrowser=1，直接改用手機預設瀏覽器打開
if (isLine && !/openExternalBrowser=1/.test(location.search)) {
  location.replace(cleanUrl() + '?openExternalBrowser=1' + location.hash)
}

export default function Login() {
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  if (inApp) {
    const url = cleanUrl()
    const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false))
    return (
      <div className="splash login">
        <img className="app-icon" src={import.meta.env.BASE_URL + 'icon.svg'} alt="好攤" width="96" height="96" />
        <h1>好攤</h1>
        <p className="inapp-warn">現在是在 {isLine ? 'LINE' : 'App'} 裡面的瀏覽器，Google 不允許在這裡登入。</p>
        <p>請點右上角或右下角的「⋯」／分享按鈕，選「{isIOS ? '用 Safari 開啟' : '用瀏覽器開啟'}」。</p>
        <button className="primary big" onClick={copy}>{copied ? '已複製，請貼到 ' + (isIOS ? 'Safari' : 'Chrome') : '複製網址'}</button>
        <p className="muted small">{url}</p>
        <p className="muted small">v{VERSION}</p>
      </div>
    )
  }
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
      <img className="app-icon" src={import.meta.env.BASE_URL + 'icon.svg'} alt="好攤" width="96" height="96" />
      <h1>好攤</h1>
      <p className="muted">擺攤收銀・庫存・預購・零錢對帳</p>
      <button className="primary big" onClick={login}>使用 Google 帳號登入</button>
      {err && <p className="warn">登入失敗：{err}</p>}
      <p className="muted small">v{VERSION}</p>
    </div>
  )
}
