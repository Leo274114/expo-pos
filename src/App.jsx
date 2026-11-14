import { HashRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { isConfigured } from './firebase-config.js'
import { preIndex, today } from './lib/calc.js'
import { exportEventExcel } from './lib/excel.js'
import Modal from './components/Modal.jsx'
import { textOn } from './lib/template.js'
import { UiProvider, ShopProvider, CartProvider, useShop, useUi, commit, leaveGuard } from './store.jsx'
import Login from './pages/Login.jsx'
import Pos from './pages/Pos.jsx'
import Orders from './pages/Orders.jsx'
import Shipping from './pages/Shipping.jsx'
import Summary from './pages/Summary.jsx'
import Cash from './pages/Cash.jsx'
import Admin from './pages/Admin.jsx'
import Hq from './pages/Hq.jsx'
import Analysis from './pages/Analysis.jsx'
import Faq, { DisclaimerList } from './pages/Faq.jsx'
import Icon from './components/Icon.jsx'
import { onboardProgress } from './components/Onboarding.jsx'

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <UiProvider>
      <ShopProvider>
        <Gate />
      </ShopProvider>
    </UiProvider>
  )
}

function Gate() {
  const s = useShop()
  if (s.user === undefined) return <div className="splash">載入中…</div>
  if (!s.user) return <Login />
  if (!s.loaded) return <div className="splash">準備攤位資料…</div>
  if (!s.shop?.consentAt) return <Consent />
  return (
    <CartProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </CartProvider>
  )
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

function Shell() {
  const s = useShop()
  const online = useOnline()
  useActivity(s)
  const preOf = preIndex(s.orders)
  const pending = s.orders.filter((o) => o.pre && o.status !== 'void' && !o.pre.shipped && !preOf(o).cancelled).length
  const links = [
    ['/', 'register', '收銀'],
    ['/orders', 'receipts', '銷售'],
    ['/summary', 'chart', '總結'],
    ['/cash', 'coins', '零錢'],
    ['/admin', 'gear', '管理'],
    ...(s.isAdmin ? [['/hq', 'users', '總覽']] : []),
    ['/analysis', 'trend', '分析'],
    ['/shipping', 'box', '預購單', pending]
  ]
  const nav = useNavigate()
  const [leaveTo, setLeaveTo] = useState(null)
  // 有沒儲存的資料（零錢頁）時，換頁前先問
  const guard = (to) => (e) => {
    if (!leaveGuard.msg) return
    e.preventDefault()
    setLeaveTo(to)
  }
  return (
    <div className="shell" style={{ '--top-bg': s.settings.themeColor || '#183d2e', '--top-fg': textOn(s.settings.themeColor || '#183d2e') }}>
      <header className="top">
        <span className="brand">{s.shop?.logo ? <img className="brand-logo" src={s.shop.logo} alt="" /> : <img className="brand-logo" src={import.meta.env.BASE_URL + 'icon.svg'} alt="" />}{s.shop?.name || '好攤'}</span>
        <span className="event">{s.event?.name || '未選擇場次'}</span>
        <span className={'net ' + (online ? (s.pendingCount ? 'busy' : 'on') : 'off')} title="尚未上傳到雲端的資料筆數">
          <i />{online
            ? (s.pendingCount ? `上傳中・${s.pendingCount} 筆` : '已全部同步')
            : (s.pendingCount ? `離線中・${s.pendingCount} 筆尚未上傳` : '離線中・可照常結帳')}
        </span>
        <Link to="/help" className="qa-link" aria-label="Q&A 說明" onClick={guard('/help')}>Q&A</Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Pos />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/cash" element={<Cash />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/hq" element={<Hq />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/help" element={<Faq />} />
        </Routes>
      </main>
      <ExpiryReminder pending={pending} />
      <nav className="bottom">
        {links.map(([to, icon, label, badge]) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={guard(to)}>
            <span className="ni"><Icon name={icon} />{badge ? <i className="dot">{badge}</i> : null}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {leaveTo && (
        <Modal title="還沒儲存" onClose={() => setLeaveTo(null)}
          footer={<>
            <button onClick={() => { leaveGuard.msg = null; nav(leaveTo); setLeaveTo(null) }}>不存，離開</button>
            <button className="primary" onClick={() => setLeaveTo(null)}>留下來儲存</button>
          </>}>
          <p className="big-text">{leaveGuard.msg}</p>
        </Modal>
      )}
    </div>
  )
}

// 展覽結束後開 App：提醒下載資料與未出貨的預購（每台裝置每天最多跳一次）
function ExpiryReminder({ pending }) {
  const s = useShop()
  const ui = useUi()
  const nav = useNavigate()
  const e = s.event
  const del = s.deleteAfterOf(e)
  const d = today()
  const ended = !!(e?.end && d > e.end)
  const expired = !!(del && d >= del)
  const dl = e?.downloadedAt || 0
  const notDl = !dl
  const key = `expiry-remind:${s.shopId}:${e?.id}`
  const [open, setOpen] = useState(() => {
    if (!ended || (!notDl && !pending && !expired)) return false
    try { return localStorage.getItem(key) !== d } catch { return true }
  })
  if (!open) return null
  const close = () => { try { localStorage.setItem(key, d) } catch { /* 忽略 */ } setOpen(false) }
  const daysLeft = del ? Math.round((new Date(del) - new Date(d)) / 86400000) : null
  return (
    <Modal title={expired ? '資料保留期限已到' : '展覽已結束'} onClose={close}
      footer={<>
        <button onClick={close}>知道了</button>
        {pending > 0 && <button onClick={() => { close(); nav('/shipping') }}>看預購單</button>}
        <button className="primary" onClick={() => exportEventExcel(s).then(close).catch((x) => ui.toast('下載失敗：' + x.message, { kind: 'error' }))}>下載 Excel</button>
      </>}>
      <p className="big-text">「{e.name}」已於 {e.end} 結束</p>
      <p className={expired ? 'warn' : ''}>
        {expired ? `資料保留至 ${del}，已到期，隨時可能被刪除。` : `資料保留至 ${del}（還有 ${daysLeft} 天），到期後刪除、不另行通知。`}
      </p>
      {pending > 0 && <p className="warn">還有 {pending} 筆預購未出貨，收件資料到期後也會一起刪除，請先出貨或抄下。</p>}
      <p className="muted">{notDl ? '這個場次還沒下載過 Excel，也還沒上傳 Google 雲端。' : `上次下載：${new Date(dl).toLocaleString('zh-TW', { hour12: false })}。`}也可以到「管理 → 資料下載」上傳 Google 雲端。</p>
    </Modal>
  )
}

// 總覽用：最後開啟 App 時間（每小時最多寫一次）與開店清單進度
function useActivity(s) {
  useEffect(() => {
    if (!s.shopPath) return
    const key = `lastSeen:${s.shopId}`
    let last = 0
    try { last = Number(localStorage.getItem(key)) || 0 } catch { /* 忽略 */ }
    const now = Date.now()
    if (now - last < 3600000 && (s.shop?.lastSeenAt || 0) >= last) return
    try { localStorage.setItem(key, String(now)) } catch { /* 忽略 */ }
    commit(s.batch().set(s.ref(s.shopPath), { lastSeenAt: now }, { merge: true }))
  }, [s.shopPath])
  const p = onboardProgress(s)
  const cur = s.shop?.onboard
  useEffect(() => {
    if (!s.shopPath || !s.loaded) return
    if (cur && cur.done === p.done && cur.total === p.total && cur.next === p.next) return
    commit(s.batch().set(s.ref(s.shopPath), { onboard: p }, { merge: true }))
  }, [s.shopPath, s.loaded, p.done, p.total, p.next])
}

function SetupNeeded() {
  return (
    <div className="splash setup">
      <h2>尚未設定 Firebase</h2>
      <p>請把 Firebase 專案的設定值貼到 <code>src/firebase-config.js</code>，再重新建置。</p>
    </div>
  )
}

// 第一次登入：同意聲明＋攤位名稱
function Consent() {
  const s = useShop()
  const [name, setName] = useState(s.shop?.name && s.shop.name !== '我的攤位' ? s.shop.name : '')
  const [ok, setOk] = useState(false)
  const nameOk = name.trim().length > 0
  const go = () => {
    if (!nameOk || !ok) return
    const b = s.batch()
    b.set(s.ref(s.shopPath), { name: name.trim(), consentAt: Date.now() }, { merge: true })
    b.commit()
  }
  return (
    <div className="splash consent">
      <div className="consent-card">
        <h2>歡迎使用好攤</h2>
        <p className="muted">登入帳號：{s.user?.email}</p>
        <label><span>攤位名稱 <span className="req">*</span> <span className="muted small">必填</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：碧湖咖啡" autoFocus maxLength={30}
            className={!nameOk ? 'need' : ''} />
        </label>
        <div className="consent-text">
          本 App 由浩子維護。浩子可查看各攤位的銷售統計，用於改良本 App；浩子不會查看您的庫存數據，也不會將任何數據提供給他人。展覽結束 14 天後資料將刪除，屆時不另行通知，請於期限內下載 Excel 檔保存。
        </div>
        <h4 className="disclaimer-title">⚠️ 使用須知（免責說明）</h4>
        <div className="consent-text disclaimer-box"><DisclaimerList /></div>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />我已閱讀並同意以上聲明與使用須知</label>
        <button className="primary big" disabled={!ok || !nameOk} onClick={go}>同意並開始</button>
        {!nameOk && <p className="warn small">請先填寫攤位名稱</p>}
        <p className="muted small">開始後到「管理 → 商品與價格」按「載入內建範本」，再填入自己的價格與庫存。</p>
      </div>
    </div>
  )
}
