import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { isConfigured } from './firebase-config.js'
import { preIndex } from './lib/calc.js'
import { UiProvider, ShopProvider, CartProvider, useShop } from './store.jsx'
import Login from './pages/Login.jsx'
import Pos from './pages/Pos.jsx'
import Orders from './pages/Orders.jsx'
import Shipping from './pages/Shipping.jsx'
import Summary from './pages/Summary.jsx'
import Cash from './pages/Cash.jsx'
import Admin from './pages/Admin.jsx'

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
    ['/', '🧾', '收銀'],
    ['/orders', '🗂️', '銷售'],
    ['/shipping', '📦', '待出貨', pending],
    ['/summary', '📊', '總結'],
    ['/cash', '💰', '零錢'],
    ['/admin', '⚙️', '管理']
  ]
  return (
    <div className="shell">
      <header className="top">
        <span className="brand">{s.shop?.name || '出攤記帳'}</span>
        <span className="event">{s.event?.name || '未選擇場次'}</span>
        <span className={'net ' + (online ? 'on' : 'off')}>{online ? '● 已連線' : '● 離線中（資料會在連線後同步）'}</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Pos />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/cash" element={<Cash />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      <nav className="bottom">
        {links.map(([to, icon, label, badge]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="ni">{icon}{badge ? <i className="dot">{badge}</i> : null}</span>
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
