import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { DEFAULT_SETTINGS, computeStock, skuLabel, addDays } from './lib/calc.js'

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
  const [ev, setEv] = useState({ stockInit: {}, orders: [], adjustments: [], cashCounts: {}, cashMoves: [], shipping: {} })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { onWriteError = (e) => toast('儲存失敗：' + (e.code || e.message), { kind: 'error', ms: 8000 }) }, [toast])

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), [])

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
  useEffect(() => {
    setEv({ stockInit: {}, orders: [], adjustments: [], cashCounts: {}, cashMoves: [], shipping: {} })
    if (!eventPath) return
    const set = (k, v) => setEv((e) => ({ ...e, [k]: v }))
    const unsubs = [
      onSnapshot(collection(db, eventPath, 'stock'), (s) => set('stockInit', toMap(s))),
      onSnapshot(collection(db, eventPath, 'orders'), (s) => set('orders', toList(s).sort((a, b) => b.ts - a.ts))),
      onSnapshot(collection(db, eventPath, 'adjustments'), (s) => set('adjustments', toList(s).sort((a, b) => b.ts - a.ts))),
      onSnapshot(collection(db, eventPath, 'cashCounts'), (s) => set('cashCounts', toMap(s))),
      onSnapshot(collection(db, eventPath, 'cashMoves'), (s) => set('cashMoves', toList(s).sort((a, b) => b.ts - a.ts))),
      onSnapshot(collection(db, eventPath, 'shipping'), (s) => set('shipping', toMap(s)))
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
    return {
      user, shop, shopId, shopPath, settings, optionLists, products, skus, events, event, eventId, eventPath,
      productById, skuById, labelOf, stock, loaded, ...ev,
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
  }, [user, shop, shopId, shopPath, optionLists, products, skus, events, eventId, eventPath, ev, loaded])

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
  const [carts, setCarts] = useState(() => [newCart('客人1')])
  const [active, setActive] = useState(0)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (saved?.carts?.length) { setCarts(saved.carts); setActive(Math.min(saved.active || 0, saved.carts.length - 1)) }
    } catch { /* 忽略 */ }
  }, [key])
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ carts, active })) } catch { /* 忽略 */ }
  }, [carts, active, key])

  const api = useMemo(() => {
    const nextName = (list) => {
      const nums = list.map((c) => Number((c.name.match(/^客人(\d+)$/) || [])[1]) || 0)
      return '客人' + (Math.max(0, ...nums) + 1)
    }
    return {
      carts, active, setActive,
      cart: carts[active] || carts[0],
      add: (init = {}) => {
        setCarts((cs) => {
          const c = { ...newCart(init.name || nextName(cs)), ...init }
          const next = [...cs, c]
          setActive(next.length - 1)
          return next
        })
      },
      update: (id, fn) => setCarts((cs) => cs.map((c) => (c.id === id ? fn(c) : c))),
      remove: (id) => setCarts((cs) => {
        const next = cs.filter((c) => c.id !== id)
        if (!next.length) { setActive(0); return [newCart('客人1')] }
        setActive((a) => Math.min(a, next.length - 1))
        return next
      })
    }
  }, [carts, active])

  return <CartCtx.Provider value={api}>{children}</CartCtx.Provider>
}
