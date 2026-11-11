// 品項銷售曲線分析：營業時間、開賣時間、重量換算公克、依「品種＋處理法」合併比較
import { lineUnits } from './calc.js'

export const DEFAULT_HOURS = { open: '10:00', close: '18:00' }

// 營業時間：場次填一組預設，個別日子可以覆寫
export function hoursFor(event, day) {
  const h = event?.hours || {}
  const base = { open: h.open || DEFAULT_HOURS.open, close: h.close || DEFAULT_HOURS.close }
  const d = h.days?.[day]
  return { ...base, ...(d || {}), custom: !!d, set: !!h.open }
}

// 'YYYY-MM-DD' + 'HH:MM'（台灣時間）→ 毫秒
export const tsAt = (day, hm) => Date.parse(`${day}T${hm}:00+08:00`)
export const hmOf = (ts) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts))

// 重量文字 → 公克；看不懂回傳 null
const UNIT_G = { 磅: 453.6, lb: 453.6, 公斤: 1000, kg: 1000, 斤: 600, 兩: 37.5, 公克: 1, 克: 1, g: 1 }
export function parseGrams(text) {
  if (!text) return null
  const t = String(text).trim().toLowerCase().replace(/\s+/g, '')
  const m = /^(四分之一|半|\d+\/\d+|\d+(?:\.\d+)?)(公斤|kg|公克|克|g|磅|lb|斤|兩)$/.exec(t)
  if (!m) return null
  let n
  if (m[1] === '半') n = 0.5
  else if (m[1] === '四分之一') n = 0.25
  else if (m[1].includes('/')) { const [a, b] = m[1].split('/').map(Number); n = b ? a / b : NaN }
  else n = Number(m[1])
  const g = n * UNIT_G[m[2]]
  return Number.isFinite(g) && g > 0 ? g : null
}

const isWeightList = (l) => l && (l.id === 'weight' || /重量/.test(l.name || ''))

// 開關紀錄：在 t 時是否啟用（沒有紀錄就用目前狀態）
export function onAt(entity, t) {
  const log = (entity?.activeLog || []).filter((x) => x && x.ts).sort((a, b) => a.ts - b.ts)
  if (!log.length) return entity?.active !== false
  let on = !log[0].on
  for (const x of log) { if (x.ts <= t) on = !!x.on; else break }
  return on
}
export const withLog = (entity, on, ts = Date.now()) => ({ active: on, activeLog: [...(entity?.activeLog || []), { ts, on }].slice(-200) })

// 比較品項：同一個商品、除了重量以外的選項都相同 → 同一個品項
export function groupOf(sku, product, optionLists = []) {
  if (!sku || !product) return null
  const lists = (product.levels || []).map((id) => optionLists.find((l) => l.id === id))
  const wi = lists.findIndex(isWeightList)
  const opts = sku.opts || []
  // 獎項不同＝不同批豆子，分開比較
  const rest = [sku.award, ...opts.filter((_, i) => i !== wi)].filter(Boolean)
  const grams = wi >= 0 ? parseGrams(opts[wi]) : null
  return {
    key: [product.id, ...rest].join('|'),
    name: rest.length ? `${product.name}・${rest.join('・')}` : product.name,
    category: product.category || '其他',
    unit: product.unit || '件',
    grams
  }
}

// 產生某一天每個比較品項的累計曲線
// 回傳 [{ key, name, category, unit, gramsOk, start, end, soldOutTs, pts: [[ts, 累計]], total, perHour }]
export function buildSeries({ orders = [], skus = [], productById = {}, optionLists = [], day, open, close, soldOut = [], stockInit = {}, mode = 'grams', now = Date.now() }) {
  const groups = {}
  const skuGroup = {}
  for (const k of skus) {
    const p = productById[k.productId]
    const g = groupOf(k, p, optionLists)
    if (!g) continue
    skuGroup[k.id] = g
    const G = (groups[g.key] ||= { ...g, skus: [], product: p, gramsOk: true })
    G.skus.push(k)
    if (g.grams == null) G.gramsOk = false
  }
  const activeAt = (G, t) => onAt(G.product, t) && G.skus.some((k) => onAt(k, t))

  // 銷售事件（只算銷售單，不含預購、贈與、沖泡；套裝與盒裝拆成組成品項）
  const events = {}
  for (const o of orders) {
    if (o.type !== 'sale' || o.status === 'void' || o.day !== day) continue
    for (const it of o.items || []) {
      if (it.pre) continue
      for (const [skuId, qty] of Object.entries(lineUnits(it))) {
        const g = skuGroup[skuId]
        if (!g) continue
        const v = mode === 'grams' ? (g.grams == null ? null : g.grams * qty) : qty
        if (v == null) continue
        ;(events[g.key] ||= []).push([o.ts, v])
      }
    }
  }

  const soldBy = {}
  for (const x of soldOut) if (x.day === day) soldBy[x.skuId] = x.ts
  const endCap = Math.min(close, Math.max(open, now))
  const out = []
  for (const G of Object.values(groups)) {
    if (mode === 'grams' && !G.gramsOk) continue
    const ev = (events[G.key] || []).sort((a, b) => a[0] - b[0])
    // 開賣時間：營業時間內第一次啟用的時刻
    const marks = [open]
    for (const e of [G.product, ...G.skus]) for (const x of e?.activeLog || []) if (x.ts > open && x.ts < close) marks.push(x.ts)
    marks.sort((a, b) => a - b)
    let start = marks.find((t) => activeAt(G, t))
    if (start == null && ev.length) start = Math.max(open, Math.min(ev[0][0], close))
    if (start == null) continue
    if (start > endCap && !ev.length) continue
    // 完售：有庫存的組合全部賣完才算
    const stocked = G.skus.filter((k) => !(k.components || []).length && (Number(stockInit[k.id]?.initial ?? stockInit[k.id]) || 0) > 0)
    const soldOutTs = stocked.length && stocked.every((k) => soldBy[k.id]) ? Math.max(...stocked.map((k) => soldBy[k.id])) : null
    const end = soldOutTs ? Math.min(soldOutTs, close) : endCap
    let c = 0
    const pts = [[start, 0]]
    for (const [t, v] of ev) { c += v; pts.push([Math.min(Math.max(t, start), Math.max(end, start)), c]) }
    pts.push([Math.max(end, start), c])
    const hrs = (Math.max(end, start) - start) / 3600000
    out.push({ key: G.key, name: G.name, category: G.category, unit: G.unit, gramsOk: G.gramsOk, start, end: Math.max(end, start), soldOutTs, pts, total: c, perHour: hrs > 0.05 ? c / hrs : 0 })
  }
  return out
}

// 標籤避免重疊：依 y 排序，太近就往下推，超出底部再整體往上
export function spreadLabels(items, gap = 15, top = 0, bottom = Infinity) {
  const a = [...items].sort((p, q) => p.y - q.y)
  for (let i = 1; i < a.length; i++) if (a[i].y < a[i - 1].y + gap) a[i].y = a[i - 1].y + gap
  for (let i = a.length - 1; i >= 0; i--) {
    const lim = i === a.length - 1 ? bottom : a[i + 1].y - gap
    if (a[i].y > lim) a[i].y = lim
  }
  if (a.length && a[0].y < top) { const d = top - a[0].y; a.forEach((x) => { x.y += d }) }
  return a
}

export const fmtAmount = (v, mode) => mode === 'grams'
  ? (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kg` : `${Math.round(v)} g`)
  : `${Math.round(v * 10) / 10}`
