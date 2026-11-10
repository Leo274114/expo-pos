import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { DEFAULT_SETTINGS, computeStock, skuLabel, addDays, today } from './lib/calc.js'
import { DEFAULT_SUPPLIES } from './lib/template.js'

// ---------- 提示訊息 ----------
const UiCtx = createContext(null)
export const useUi = () => useContext(UiCtx)

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [notices, setNotices] = useState([]) // 收銀畫面上方的庫存通知
  const seq = useRef(0)
  const toast = useCallback((text, opt = {}) => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, text, ...opt }].slice(-3))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opt.ms || 3500)
    return id
  }, [])
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notice = useCallback((text) => {
    const id = ++seq.current
    setNotices((n) => [{ id, text }, ...n].slice(0, 5))
  }, [])
  const dismissNotice = useCallback((id) => setNotices((n) => n.filter((x) => x.id !== id)), [])
  return (
    <UiCtx.Provider value={{ toast, dismissToast, notice, dismissNotice, notices }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind || '')} onClick={() => !t.action && dismissToast(t.id)}>
            <span>{t.text}</span>
            {t.action && (
              <button className="link" onClick={() => { t.action.onClick(); dismissToast(t.id) }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </UiCtx.Provider>
  )
}

// ---------- 寫入（離線時不等伺服器回應） ----------
let onWriteError = () => {}
export function commit(batch) {
  batch.commit().catch((e) => onWriteError(e))
}
export const newId = (path) => doc(collection(db, path)).id
export const deviceId = (() => {
  try {
    let id = localStorage.getItem('deviceId')
    if (!id) { id = Math.random().toString(36).slice(2, 8); localStorage.setItem('deviceId', id) }
    return id
  } catch { return 'dev' }
})()

// ---------- 攤位資料 ----------
const ShopCtx = createContext(null)
export const useShop = () => useContext(ShopCtx)

const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
const toMap = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))

export function ShopProvider({ children }) {
  const { toast } = useUi()
  const [user, setUser] = useState(undefined) // undefined = 載入中
  const [shop, setShop] = useState(null)
  const [optionLists, setOptionLists] = useState([])
  const [products, setProducts] = useState([])
  const [skus, setSkus] = useState([])
  const [events, setEvents] = useState([])
  const [ev, setEv] = useState({ stockInit: {}, orders: [], adjustments: [], cashCounts: {}, cashMoves: [], shipping: {}, supplies: {} })
  const [loaded, setLoaded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => { onWriteError = (e) => toast('儲存失敗：' + (e.code || e.message), { kind: 'error', ms: 8000 }) }, [toast])

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), [])

  // 系統管理者：Firestore 的 admins/{uid} 文件存在
  useEffect(() => {
    setIsAdmin(false)
    if (!user?.uid) return
    getDoc(doc(db, 'admins', user.uid)).then((s) => setIsAdmin(s.exists())).catch(() => setIsAdmin(false))
  }, [user?.uid])

  const shopId = user?.uid
  const shopPath = shopId ? `shops/${shopId}` : null

  // 攤位層
  useEffect(() => {
    if (!shopPath) return
    setLoaded(false)
    const ref = doc(db, shopPath)
    const unsubs = [
      onSnapshot(ref, (s) => {
        if (!s.exists()) {
          setDoc(ref, {
            name: '我的攤位', ownerUid: shopId, ownerEmail: user.email || '',
            createdAt: Date.now(), settings: DEFAULT_SETTINGS, currentEventId: null
          }).catch((e) => onWriteError(e))
          return
        }
        setShop({ id: s.id, ...s.data() })
        setLoaded(true)
      }, (e) => toast('讀取失敗：' + e.code, { kind: 'error', ms: 8000 })),
      onSnapshot(collection(db, shopPath, 'optionLists'), (s) => setOptionLists(toList(s).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))),
      onSnapshot(collection(db, shopPath, 'products'), (s) => setProducts(toList(s).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))),
      onSnapshot(collection(db, shopPath, 'skus'), (s) => setSkus(toList(s).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))),
      onSnapshot(collection(db, shopPath, 'events'), (s) => setEvents(toList(s).sort((a, b) => (b.start || '').localeCompare(a.start || ''))))
    ]
    return () => unsubs.forEach((u) => u())
  }, [shopPath])

  const eventId = shop?.currentEventId || null
  const eventPath = shopPath && eventId ? `${shopPath}/events/${eventId}` : null

  // 展覽場次層
  const [pend, setPend] = useState({})
  useEffect(() => {
    setEv({ stockInit: {}, orders: [], adjustments: [], cashCounts: {}, cashMoves: [], shipping: {}, supplies: {} })
    if (!eventPath) return
    const set = (k, v) => setEv((e) => ({ ...e, [k]: v }))
    setPend({})
    // includeMetadataChanges：連文件「是否還沒上傳到雲端」的狀態變化也會通知
    const watch = (name, fn) => onSnapshot(collection(db, eventPath, name), { includeMetadataChanges: true }, (s) => {
      const n = s.docs.filter((d) => d.metadata?.hasPendingWrites).length
      setPend((p) => (p[name] === n ? p : { ...p, [name]: n }))
      fn(s)
    })
    const unsubs = [
      watch('stock', (s) => set('stockInit', toMap(s))),
      watch('orders', (s) => set('orders', toList(s).sort((a, b) => b.ts - a.ts))),
      watch('adjustments', (s) => set('adjustments', toList(s).sort((a, b) => b.ts - a.ts))),
      watch('cashCounts', (s) => set('cashCounts', toMap(s))),
      watch('cashMoves', (s) => set('cashMoves', toList(s).sort((a, b) => b.ts - a.ts))),
      watch('shipping', (s) => set('shipping', toMap(s))),
      watch('supplies', (s) => set('supplies', toMap(s)))
    ]
    return () => unsubs.forEach((u) => u())
  }, [eventPath])

  const value = useMemo(() => {
    const settings = { ...DEFAULT_SETTINGS, ...(shop?.settings || {}) }
    const productById = Object.fromEntries(products.map((p) => [p.id, p]))
    const skuById = Object.fromEntries(skus.map((s) => [s.id, s]))
    const labelOf = (skuId) => {
      const s = skuById[skuId]
      return s ? skuLabel(s, productById[s.productId]) : '（已刪除品項）'
    }
    const stock = computeStock(ev.stockInit, ev.orders, ev.adjustments)
    const event = events.find((e) => e.id === eventId) || null
    const supplyItems = shop?.supplyItems || DEFAULT_SUPPLIES
    return {
      user, isAdmin, shop, shopId, shopPath, settings, optionLists, products, skus, events, event, eventId, eventPath,
      productById, skuById, labelOf, stock, loaded, ...ev, supplyItems,
      pendingCount: Object.values(pend).reduce((a, b) => a + b, 0),
      pendingOrders: pend.orders || 0,
      // 寫入工具
      batch: () => writeBatch(db),
      ref: (...p) => doc(db, ...p),
      newId,
      saveSettings: (patch) => {
        const b = writeBatch(db)
        b.set(doc(db, shopPath), { settings: { ...settings, ...patch } }, { merge: true })
        commit(b)
      },
      deleteAfterOf: (e) => (e?.end ? addDays(e.end, 14) : null)
    }
  }, [user, isAdmin, shop, shopId, shopPath, optionLists, products, skus, events, eventId, eventPath, ev, loaded, pend])

  return <ShopCtx.Provider value={value}>{children}</ShopCtx.Provider>
}

// ---------- 購物車（多客人暫存單，存在本機） ----------
const CartCtx = createContext(null)
export const useCarts = () => useContext(CartCtx)

let cartSeq = 0
const newCart = (name) => ({ id: Date.now().toString(36) + (cartSeq++), name, lines: [], discount: null, refOrderId: null })

export function CartProvider({ children }) {
  const { shopId } = useShop()
  const key = `carts:${shopId}`
  // 客人編號：每台裝置每天從 1 開始，一直往上加，結帳後不會往回補
  const counter = useRef({ day: today(), n: 0 })
  const takeName = () => {
    const d = today()
    if (counter.current.day !== d) counter.current = { day: d, n: 0 }
    counter.current.n += 1
    return '客人' + counter.current.n
  }
  const [carts, setCarts] = useState(() => [newCart('客人1')])
  const [active, setActive] = useState(0)
  const [ready, setReady] = useState(false)

  // 換日：清掉空的卡片、編號從 1 重新開始；還有品項沒結帳的卡片保留
  const rollDay = (cs) => {
    if (counter.current.day === today()) return cs
    counter.current = { day: today(), n: 0 }
    const kept = cs.filter((c) => c.lines.length)
    return kept.length ? kept : [newCart(takeName())]
  }

  useEffect(() => {
    let cs = null
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (saved?.counter) counter.current = saved.counter
      if (saved?.carts?.length) { cs = saved.carts; setActive(Math.min(saved.active || 0, saved.carts.length - 1)) }
    } catch { /* 忽略 */ }
    if (!cs) { counter.current = { day: today(), n: 0 }; cs = [newCart(takeName())] }
    const rolled = rollDay(cs)
    if (rolled !== cs) setActive(0)
    setCarts(rolled)
    setReady(true)
  }, [key])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(key, JSON.stringify({ carts, active, counter: counter.current })) } catch { /* 忽略 */ }
  }, [carts, active, key, ready])
  // App 一直開著跨過午夜，或隔天從背景切回來時也會換日
  useEffect(() => {
    const check = () => setCarts((cs) => { const r = rollDay(cs); if (r !== cs) setActive(0); return r })
    const id = setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check) }
  }, [])

  const api = useMemo(() => ({
    carts, active, setActive,
    cart: carts[active] || carts[0],
    today: counter.current,
    add: (init = {}) => {
      const name = init.name || takeName()
      setCarts((cs) => {
        const next = [...cs, { ...newCart(name), ...init, name }]
        setActive(next.length - 1)
        return next
      })
    },
    update: (id, fn) => setCarts((cs) => cs.map((c) => (c.id === id ? fn(c) : c))),
    remove: (id) => {
      const fresh = carts.every((c) => c.id === id) ? newCart(takeName()) : null
      setCarts((cs) => {
        const next = cs.filter((c) => c.id !== id)
        if (!next.length) { setActive(0); return [fresh || newCart('客人' + counter.current.n)] }
        setActive((a) => Math.min(a, next.length - 1))
        return next
      })
    },
    // 復原被清除的客人卡片（放回原位置；清除最後一張時自動補的空卡片一併拿掉）
    restore: (cart, idx) => {
      setCarts((cs) => {
        if (cs.some((c) => c.id === cart.id)) return cs
        const rest = cs.length === 1 && !cs[0].lines.length ? [] : cs
        const at = Math.min(idx, rest.length)
        const next = [...rest.slice(0, at), cart, ...rest.slice(at)]
        setActive(at)
        return next
      })
    }
  }), [carts, active])

  return <CartCtx.Provider value={api}>{children}</CartCtx.Provider>
}
