import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { isConfigured } from './firebase-config.js'
import { preIndex } from './lib/calc.js'
import { textOn } from './lib/template.js'
import { UiProvider, ShopProvider, CartProvider, useShop } from './store.jsx'
import Login from './pages/Login.jsx'
import Pos from './pages/Pos.jsx'
import Orders from './pages/Orders.jsx'
import Shipping from './pages/Shipping.jsx'
import Summary from './pages/Summary.jsx'
import Cash from './pages/Cash.jsx'
import Admin from './pages/Admin.jsx'
import Hq from './pages/Hq.jsx'
import Icon from './components/Icon.jsx'

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
  const preOf = preIndex(s.orders)
  const pending = s.orders.filter((o) => o.pre && o.status !== 'void' && !o.pre.shipped && !preOf(o).cancelled).length
  const links = [
    ['/', 'register', '收銀'],
    ['/orders', 'receipts', '銷售'],
    ['/summary', 'chart', '總結'],
    ['/cash', 'coins', '零錢'],
    ['/admin', 'gear', '管理'],
    ...(s.isAdmin ? [['/hq', 'users', '總覽']] : []),
    ['/shipping', 'box', '待出貨', pending]
  ]
  return (
    <div className="shell" style={{ '--top-bg': s.settings.themeColor || '#183d2e', '--top-fg': textOn(s.settings.themeColor || '#183d2e') }}>
      <header className="top">
        <span className="brand"><Icon name="leaf" size={20} />{s.shop?.name || '出攤記帳'}</span>
        <span className="event">{s.event?.name || '未選擇場次'}</span>
        <span className={'net ' + (online ? 'on' : 'off')}><i />{online ? '已連線' : '離線中，連線後自動同步'}</span>
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
        </Routes>
      </main>
      <nav className="bottom">
        {links.map(([to, icon, label, badge]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="ni"><Icon name={icon} />{badge ? <i className="dot">{badge}</i> : null}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
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
  const go = () => {
    const b = s.batch()
    b.set(s.ref(s.shopPath), { name: name.trim() || '我的攤位', consentAt: Date.now() }, { merge: true })
    b.commit()
  }
  return (
    <div className="splash consent">
      <div className="consent-card">
        <h2>歡迎使用出攤記帳</h2>
        <p className="muted">登入帳號：{s.user?.email}</p>
        <label>攤位名稱
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：碧湖咖啡" autoFocus />
        </label>
        <div className="consent-text">
          本 App 由浩子維護。浩子可查看各攤位的銷售統計，用於改良本 App；浩子不會查看您的庫存數據，也不會將任何數據提供給他人。展覽結束 14 天後資料將刪除，屆時不另行通知，請於期限內下載 Excel 檔保存。
        </div>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />我已閱讀並同意</label>
        <button className="primary big" disabled={!ok} onClick={go}>同意並開始</button>
        <p className="muted small">開始後到「管理 → 商品與價格」按「載入內建範本」，再填入自己的價格與庫存。</p>
      </div>
    </div>
  )
}
