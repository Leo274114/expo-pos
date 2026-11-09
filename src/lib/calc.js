// 純計算邏輯（不依賴 Firebase / React），方便測試。

export const ALL_DENOMS = [1000, 500, 100, 50, 10, 5, 1]

export const DEFAULT_SETTINGS = {
  cashCount: true,        // 零錢數量管理
  coin1: false,           // 1 元面額
  giftEnabled: true,      // 贈與單
  brewEnabled: true,      // 沖泡耗用單
  preorderEnabled: true,  // 預定&宅配
  prePayTypes: { full: true, deposit: true, cod: true },
  freeShipThreshold: 0,   // 0 = 未設定
  voiceEnabled: false,    // 語音輸入（第二階段）
  lowStock: { 5: true, 3: true, 1: true }
}

export const PAY_TYPE_LABEL = { full: '現場付全額', deposit: '先付訂金', cod: '貨到付款' }
export const METHOD_LABEL = { cash: '現金', linepay: 'LINE Pay' }
export const TYPE_LABEL = {
  sale: '銷售', gift: '贈與', brew: '沖泡耗用', return: '退貨', exchange: '換貨',
  collect: '收尾款', cancelPre: '取消預定'
}
export const GIFT_TO = ['客人', '長官', '活動贊助']

// ---------- 時間（台灣時區） ----------
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })
const timeFmt = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export const dayOf = (ts) => dayFmt.format(new Date(ts))
export const hourOf = (ts) => Number(hourFmt.format(new Date(ts))) % 24
export const timeOf = (ts) => timeFmt.format(new Date(ts))
export const today = () => dayOf(Date.now())

export function daysBetween(start, end) {
  const out = []
  if (!start || !end) return out
  let d = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  while (d <= e && out.length < 60) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return out
}

export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z')
  return new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10)
}

// ---------- 金額 ----------
export const fmt = (n) => {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US')
}

export const denomsFor = (settings) => ALL_DENOMS.filter((d) => d !== 1 || settings?.coin1)

// 找零建議：貪婪法
export function changeBreakdown(amount, denoms = ALL_DENOMS) {
  let left = Math.round(amount)
  const out = []
  for (const d of denoms) {
    const n = Math.floor(left / d)
    if (n > 0) { out.push([d, n]); left -= n * d }
  }
  return { parts: out, rest: left }
}

export const countTotal = (counts = {}) =>
  Object.entries(counts).reduce((s, [d, n]) => s + Number(d) * (Number(n) || 0), 0)

// ---------- 商品 ----------
export function skuLabel(sku, product) {
  const base = product?.name ?? sku?.productName ?? '?'
  const opts = (sku?.opts || []).filter(Boolean)
  return opts.length ? `${base}・${opts.join('・')}` : base
}

export const effectivePrice = (sku) =>
  sku.promoPrice !== null && sku.promoPrice !== undefined && sku.promoPrice !== '' ? Number(sku.promoPrice) : Number(sku.price || 0)

// ---------- 單據對庫存的影響 ----------
// 回傳 [{skuId, delta, reason}]；作廢單無影響
// 品項若有 components（套裝、盒裝共用散包庫存），改扣組成品項：每件扣 qty × 組成數量
const expand = (it, sign, reason) =>
  it.components?.length
    ? it.components.map((c) => ({ skuId: c.skuId, delta: sign * it.qty * c.qty, reason: `${reason}（${it.name}）` }))
    : [{ skuId: it.skuId, delta: sign * it.qty, reason }]

export function orderMoves(o) {
  if (!o || o.status === 'void') return []
  const out = []
  const items = o.items || []
  const rets = o.rets || []
  if (o.type === 'sale' || o.type === 'exchange') {
    for (const it of items) if (!it.pre) out.push(...expand(it, -1, o.type === 'sale' ? '銷售' : '換貨換出'))
  } else if (o.type === 'gift') {
    for (const it of items) out.push(...expand(it, -1, '贈與'))
  } else if (o.type === 'brew') {
    for (const it of items) out.push(...expand(it, -1, '沖泡耗用'))
  }
  if (o.type === 'return' || o.type === 'exchange') {
    for (const r of rets) {
      if (r.restock) out.push(...expand(r, 1, '退貨回庫存'))
      else out.push({ skuId: r.skuId, delta: 0, reason: `瑕疵不回庫存（${r.qty}）` })
    }
  }
  return out
}

// 一列購物車佔用各基本品項幾件：{ skuId: 件數 }
export function lineUnits(line) {
  if (line.components?.length) return Object.fromEntries(line.components.map((c) => [c.skuId, c.qty * line.qty]))
  return { [line.skuId]: line.qty }
}

// 套裝／連動品項可賣幾件：各組成品項可用量 ÷ 組成數量，取最小
export function bundleAvail(components, availOf) {
  return Math.min(...components.map((c) => Math.floor(availOf(c.skuId) / c.qty)))
}

// 目前庫存 = 初始 + 所有異動
export function computeStock(stockInit = {}, orders = [], adjustments = []) {
  const s = {}
  for (const [k, v] of Object.entries(stockInit)) s[k] = Number(v?.initial ?? v) || 0
  for (const o of orders) for (const m of orderMoves(o)) s[m.skuId] = (s[m.skuId] || 0) + m.delta
  for (const a of adjustments) s[a.skuId] = (s[a.skuId] || 0) + (Number(a.delta) || 0)
  return s
}

// 原單已被退回的數量：{ orderId: { skuId: qty } }
export function returnedMap(orders = []) {
  const m = {}
  for (const o of orders) {
    if (o.status === 'void' || !o.refOrderId) continue
    if (o.type !== 'return' && o.type !== 'exchange') continue
    const t = (m[o.refOrderId] ||= {})
    for (const r of o.rets || []) t[r.skuId] = (t[r.skuId] || 0) + r.qty
  }
  return m
}

// 退款單價：整單折扣按比例分攤
export function refundUnit(order, item) {
  const sub = order.subtotal || 0
  const ratio = sub > 0 ? (order.discountAmt || 0) / sub : 0
  return Math.round(item.price * (1 - ratio))
}

// ---------- 購物車 ----------
export function discountAmount(subtotal, discount) {
  if (!discount || !discount.value) return 0
  if (discount.type === 'percent') {
    const f = Number(discount.value) / 10 // 9 = 9折
    if (!(f > 0 && f <= 1)) return 0
    return Math.round(subtotal * (1 - f))
  }
  return Math.min(Math.max(0, Math.round(Number(discount.value))), subtotal)
}

// 計算購物車金額
// opt: { shippingFee, payType, deposit }
export function cartTotals(cart, opt = {}) {
  const lines = cart?.lines || []
  const out = lines.filter((l) => !l.ret)
  const ret = lines.filter((l) => l.ret)
  const subtotal = out.reduce((s, l) => s + l.price * l.qty, 0)
  const listTotal = out.reduce((s, l) => s + l.listPrice * l.qty, 0)
  const discountAmt = discountAmount(subtotal, cart?.discount)
  const ratio = subtotal > 0 ? discountAmt / subtotal : 0
  const preSub = out.filter((l) => l.pre).reduce((s, l) => s + l.price * l.qty, 0)
  const hasPre = preSub > 0 || out.some((l) => l.pre)
  const ship = hasPre ? Math.max(0, Math.round(Number(opt.shippingFee) || 0)) : 0
  const preShare = Math.round(preSub * (1 - ratio)) + ship // 預定部分（含運費）
  const retTotal = ret.reduce((s, l) => s + l.price * l.qty, 0)
  const total = subtotal - discountAmt + ship - retTotal
  let due = 0
  if (hasPre) {
    if (opt.payType === 'cod') due = preShare
    else if (opt.payType === 'deposit') due = Math.max(0, preShare - Math.max(0, Math.round(Number(opt.deposit) || 0)))
  }
  const dueNow = total - due
  return { subtotal, listTotal, discountAmt, ship, preSub, preShare, hasPre, retTotal, total, due, dueNow, count: out.reduce((s, l) => s + l.qty, 0) }
}

// 低庫存門檻跨越：回傳要提醒的 [{skuId, left}]
export function lowStockCrossings(before, after, settings) {
  const th = Object.entries(settings?.lowStock || {}).filter(([, on]) => on).map(([k]) => Number(k))
  const out = []
  for (const skuId of Object.keys(after)) {
    const b = before[skuId], a = after[skuId]
    if (b === undefined || a >= b) continue
    if (th.some((t) => b > t && a <= t) || (b > 0 && a <= 0)) out.push({ skuId, left: a })
  }
  return out
}

// 預定狀態：尾款與取消由「收尾款／取消預定」單據推算，作廢那些單據時自動還原
export function preIndex(orders = []) {
  const collected = {}, cancelled = {}
  for (const o of orders) {
    if (o.status === 'void' || !o.refOrderId) continue
    if (o.type === 'collect') collected[o.refOrderId] = (collected[o.refOrderId] || 0) + (o.money?.amount || 0)
    if (o.type === 'cancelPre') cancelled[o.refOrderId] = true
  }
  return (o) => {
    if (!o?.pre) return null
    const c = collected[o.id] || 0
    return { ...o.pre, collected: c, cancelled: !!cancelled[o.id], left: Math.max(0, (o.pre.due || 0) - c), paid: (o.pre.paidNow || 0) + c }
  }
}

// ---------- 報表 ----------
export function summarize(orders = [], day, adjustments = []) {
  const live = orders.filter((o) => o.status !== 'void' && (!day || o.day === day))
  const preOf = preIndex(orders)
  const r = {
    revenue: { cash: 0, linepay: 0, total: 0 },
    listTotal: 0, discountTotal: 0, refundTotal: 0, shipTotal: 0,
    perSku: {}, hourly: {},
    pre: { orders: 0, qty: 0, paid: 0, due: 0 },
    gifts: { count: 0, value: 0, byTo: {} },
    brew: { qty: 0, value: 0 },
    promos: {},
    orderCount: 0
  }
  const sku = (it) => (r.perSku[it.skuId] ||= { skuId: it.skuId, name: it.name, category: it.category || '', qty: 0, preQty: 0, amount: 0, retQty: 0, giftQty: 0, brewQty: 0 })
  for (const o of live) {
    const m = o.money
    if (m && m.amount) {
      r.revenue[m.method] = (r.revenue[m.method] || 0) + m.amount
      r.revenue.total += m.amount
      const h = hourOf(o.ts)
      r.hourly[h] = (r.hourly[h] || 0) + m.amount
    }
    if (o.type === 'sale' || o.type === 'exchange') {
      if (o.type === 'sale') r.orderCount++
      for (const p of o.promos || []) r.promos[p.text] = (r.promos[p.text] || 0) + (p.count || 1)
      r.discountTotal += o.discountAmt || 0
      const ps = preOf(o)
      if (!ps?.cancelled) r.shipTotal += o.shippingFee || 0
      for (const it of o.items || []) {
        r.listTotal += it.listPrice * it.qty
        r.discountTotal += (it.listPrice - it.price) * it.qty
        const s = sku(it)
        if (it.pre) s.preQty += it.qty; else s.qty += it.qty
        s.amount += it.price * it.qty
      }
      if (ps && !ps.cancelled) {
        r.pre.orders++
        r.pre.qty += (o.items || []).filter((i) => i.pre).reduce((a, i) => a + i.qty, 0)
        r.pre.paid += ps.paidNow || 0
        r.pre.due += ps.left
      }
    }
    if (o.type === 'return' || o.type === 'exchange') {
      for (const x of o.rets || []) {
        r.refundTotal += x.price * x.qty
        sku(x).retQty += x.qty
      }
    }
    if (o.type === 'gift') {
      r.gifts.count++
      const to = o.gift?.to || '其他'
      const v = (o.items || []).reduce((a, i) => a + i.listPrice * i.qty, 0)
      r.gifts.value += v
      const b = (r.gifts.byTo[to] ||= { count: 0, value: 0 })
      b.count++; b.value += v
      for (const it of o.items || []) sku(it).giftQty += it.qty
    }
    if (o.type === 'brew') {
      for (const it of o.items || []) { r.brew.qty += it.qty; r.brew.value += it.listPrice * it.qty; sku(it).brewQty += it.qty }
    }
  }
  return r
}

// 應有現金：零用金 + 當日所有現金收支 + 現金調整
export function expectedCash(orders = [], day, openTotal = 0, cashMoves = []) {
  let cash = 0
  for (const o of orders) {
    if (o.status === 'void' || o.day !== day) continue
    if (o.money?.method === 'cash') cash += o.money.amount || 0
  }
  const adj = cashMoves.filter((c) => c.day === day).reduce((s, c) => s + (Number(c.amount) || 0), 0)
  return { cashSales: cash, adjustments: adj, expected: openTotal + cash + adj }
}

export const componentAvail = (components, availOf) => bundleAvail(components, availOf)

// ---------- 滿額活動 ----------
// promos: [{ id, threshold, text, repeat, on }]；amount = 商品金額（扣折扣、不含運費）
export function promoHits(amount, promos = []) {
  return promos
    .filter((p) => p.on !== false && Number(p.threshold) > 0 && amount >= Number(p.threshold))
    .map((p) => ({ id: p.id, text: p.text || '滿額活動', threshold: Number(p.threshold), count: p.repeat ? Math.floor(amount / Number(p.threshold)) : 1 }))
}
// 最接近、還沒達到的活動（用來提醒「再買多少」）
export function promoNext(amount, promos = []) {
  const next = promos
    .filter((p) => p.on !== false && Number(p.threshold) > 0)
    .map((p) => {
      const t = Number(p.threshold)
      const goal = p.repeat ? (Math.floor(amount / t) + 1) * t : t
      return { text: p.text || '滿額活動', gap: goal - amount, goal }
    })
    .filter((x) => x.gap > 0 && (x.goal - x.gap) >= x.goal * 0.6)
    .sort((a, b) => a.gap - b.gap)
  return next[0] || null
}
export const orderPromoAmount = (o) => Math.max(0, (o.subtotal || 0) - (o.discountAmt || 0))

// ---------- 完售紀錄 ----------
// 依時間重播所有異動，記下每個品項第一次賣到 0 的時間：[{ skuId, ts, day, sold }]
export function soldOutTimes(stockInit = {}, orders = [], adjustments = []) {
  const level = {}
  const sold = {}
  for (const [k, v] of Object.entries(stockInit)) level[k] = Number(v?.initial ?? v) || 0
  const events = []
  for (const o of orders) for (const m of orderMoves(o)) if (m.delta) events.push({ ts: o.ts, skuId: m.skuId, delta: m.delta, sale: o.type === 'sale' || o.type === 'exchange' })
  for (const a of adjustments) if (Number(a.delta)) events.push({ ts: a.ts, skuId: a.skuId, delta: Number(a.delta) })
  events.sort((a, b) => a.ts - b.ts)
  const out = {}
  for (const e of events) {
    if (!(e.skuId in level)) continue
    const before = level[e.skuId]
    level[e.skuId] = before + e.delta
    if (e.delta < 0 && e.sale) sold[e.skuId] = (sold[e.skuId] || 0) - e.delta
    if (before > 0 && level[e.skuId] <= 0 && !out[e.skuId]) out[e.skuId] = { skuId: e.skuId, ts: e.ts, day: dayOf(e.ts), sold: sold[e.skuId] || 0 }
  }
  return Object.values(out).sort((a, b) => a.ts - b.ts)
}

// ---------- 耗材 ----------
// items：耗材清單 [{ id, name, unit }]；records：本場次紀錄 { id: { prep, left, name, unit } }
// 本次用量 = 展前準備 − 展後剩餘（兩個都有填才算）
export function supplyRows(items = [], records = {}) {
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const ids = new Set(items.map((x) => x.id))
  const rows = items.map((it) => ({ ...(records[it.id] || {}), id: it.id, name: it.name, unit: it.unit }))
  // 已從清單移除、但這個場次有紀錄的耗材也列出來
  for (const [id, x] of Object.entries(records || {})) if (!ids.has(id)) rows.push({ ...x, id })
  return rows.map((x) => {
    const prep = num(x.prep), left = num(x.left)
    return { id: x.id, name: x.name, unit: x.unit || '', prep, left, used: prep != null && left != null ? prep - left : null }
  })
}
