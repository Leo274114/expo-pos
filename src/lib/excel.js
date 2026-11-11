import { sortCats } from './template.js'
import { soldOutTimes, preIndex, TYPE_LABEL, METHOD_LABEL, PAY_TYPE_LABEL, timeOf, orderMoves, summarize, countTotal, expectedCash, daysBetween, skuLabel, supplyRows } from './calc.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLSX_TYPE = { description: 'Excel 檔案', accept: { [XLSX_MIME]: ['.xlsx'] } }

// 電腦版 Chrome／Edge：先跳出「另存新檔」讓使用者選資料夾與檔名（要在按下按鈕的當下呼叫）
// 其他瀏覽器回傳 null，之後照原本方式下載
async function pickSaveTarget(name) {
  if (typeof window === 'undefined' || !window.showSaveFilePicker) return null
  try {
    return await window.showSaveFilePicker({ suggestedName: name, types: [XLSX_TYPE] })
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancel'
    return null // 不支援或被擋住：改用一般下載
  }
}

async function saveWorkbook(XLSX, wb, name, target) {
  if (target && target !== 'cancel') {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const w = await target.createWritable()
    await w.write(new Blob([buf], { type: XLSX_MIME }))
    await w.close()
  } else {
    XLSX.writeFile(wb, name)
  }
}

const safeName = (n) => n.replace(/[\\/:*?"<>|]/g, '_')

// 下載整個場次的 Excel；回傳 true＝已存檔，false＝使用者取消
// 存檔後在場次記下「已下載」時間，總覽的清除清單會亮綠燈
export async function exportEventExcel(s) {
  const name = safeName(`${s.shop?.name || '好攤'}_${s.event?.name || ''}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  const target = await pickSaveTarget(name)
  if (target === 'cancel') return false
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const [sheet, rows] of eventSheets(s)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 說明: '無資料' }])
    const keys = Object.keys(rows[0] || { 說明: '' })
    ws['!cols'] = keys.map((k) => ({ wch: Math.max(8, Math.min(40, Math.max(k.length * 2, ...rows.map((r) => String(r[k] ?? '').length * 1.6)))) }))
    XLSX.utils.book_append_sheet(wb, ws, sheet)
  }
  await saveWorkbook(XLSX, wb, name, target)
  markDownloaded(s)
  return true
}

// 場次已下載／已備份：總覽的清除清單亮綠燈
export function markDownloaded(s, extra = {}) {
  if (!s.eventPath) return
  try { s.batch().set(s.ref(s.eventPath), { downloadedAt: Date.now(), ...extra }, { merge: true }).commit().catch(() => {}) } catch { /* 忽略 */ }
}

// 整個場次的所有工作表：[[名稱, 列資料], ...]（Excel 與 Google 雲端共用）
export function eventSheets(s) {
  const out = []
  const add = (name, rows) => out.push([name, rows])
  const orders = [...s.orders].sort((a, b) => a.ts - b.ts)
  const allDays = [...new Set([...daysBetween(s.event?.start, s.event?.end), ...orders.map((o) => o.day)])].filter(Boolean).sort()

  // 展期總覽：每天一列＋合計
  const ov = allDays.map((d) => {
    const r = summarize(orders, d)
    return { 日期: d, 營業額: r.revenue.total, 現金: r.revenue.cash || 0, 'LINE Pay': r.revenue.linepay || 0, 客人數: r.orderCount, 折扣總額: r.discountTotal, 退貨金額: r.refundTotal, 運費收入: r.shipTotal }
  })
  const tot = summarize(orders)
  ov.push({ 日期: '整個展期', 營業額: tot.revenue.total, 現金: tot.revenue.cash || 0, 'LINE Pay': tot.revenue.linepay || 0, 客人數: tot.orderCount, 折扣總額: tot.discountTotal, 退貨金額: tot.refundTotal, 運費收入: tot.shipTotal })
  add('展期總覽', ov)

  // 每小時營業額（尖峰）：每列一個時段，每欄一天
  const perDay = allDays.map((d) => [d, summarize(orders, d).hourly])
  const hs = perDay.flatMap(([, h]) => Object.keys(h).map(Number))
  const h0 = Math.min(10, ...hs), h1 = Math.max(18, ...hs)
  const hourRows = []
  for (let h = h0; h <= h1; h++) {
    const row = { 時段: `${String(h).padStart(2, '0')}:00` }
    for (const [d, hh] of perDay) row[d.slice(5).replace('-', '/')] = hh[h] || 0
    hourRows.push(row)
  }
  add('每小時營業額', hourRows)

  // 商品價格（下載當時的定價與活動價）
  add('商品價格', priceListRows(s))

  const no = Object.fromEntries(orders.map((o, i) => [o.id, i + 1]))
  const status = (o) => (o.status === 'void' ? '已作廢' : '')

  // 1. 銷售明細（每個品項一列）
  const detail = []
  for (const o of orders) {
    const base = {
      單號: no[o.id], 日期: o.day, 時間: timeOf(o.ts), 類型: TYPE_LABEL[o.type] || o.type, 狀態: status(o),
      付款方式: METHOD_LABEL[o.money?.method] || '', 本次收付: o.money?.amount || 0, 收款: o.money?.received ?? '', 找零: o.money?.change ?? '',
      整單折扣: o.discountAmt || 0, 運費: o.shippingFee || 0, 單據合計: o.total ?? '', 贈與對象: o.gift?.to || '', 滿額活動: (o.promos || []).map((p) => p.text + (p.count > 1 ? '×' + p.count : '')).join('、'), 備註: o.note || o.gift?.note || '',
      原單號: o.refOrderId ? no[o.refOrderId] || '' : ''
    }
    const lines = [
      ...(o.items || []).map((i) => ({ 品項: i.name, 數量: i.qty, 定價: i.listPrice, 實售價: i.price, 小計: i.price * i.qty, 預購: i.pre ? '是' : '', 改價原因: i.reason || '' })),
      ...(o.rets || []).map((r) => ({ 品項: '【退回】' + r.name, 數量: -r.qty, 定價: '', 實售價: r.price, 小計: -r.price * r.qty, 預購: '', 改價原因: r.restock ? '回庫存' : '瑕疵不回庫存' }))
    ]
    if (!lines.length) detail.push({ ...base, 品項: '', 數量: '', 定價: '', 實售價: '', 小計: '', 預購: '', 改價原因: '' })
    lines.forEach((l, idx) => detail.push(idx === 0 ? { ...base, ...l } : { 單號: base.單號, 日期: base.日期, 時間: base.時間, 類型: base.類型, 狀態: base.狀態, ...l }))
  }
  add('銷售明細', detail)

  // 2. 品項統計（全展期）
  const sum = summarize(orders)
  add('品項統計', Object.values(sum.perSku).map((x) => ({
    品項: x.name, 銷售數量: x.qty, 預購數量: x.preQty, 退回數量: x.retQty, 贈與數量: x.giftQty, 沖泡耗用: x.brewQty, 銷售金額: x.amount
  })))

  // 3. 每日營業額
  const days = daysBetween(s.event?.start, s.event?.end)
  const extra = [...new Set(orders.map((o) => o.day))].filter((d) => !days.includes(d))
  add('每日營業額', [...days, ...extra].sort().map((d) => {
    const r = summarize(orders, d)
    return { 日期: d, 現金: r.revenue.cash || 0, 'LINE Pay': r.revenue.linepay || 0, 合計: r.revenue.total, 原價總額: r.listTotal, 折扣總額: r.discountTotal, 退貨金額: r.refundTotal, 運費收入: r.shipTotal, 銷售筆數: r.orderCount }
  }))

  // 4. 庫存
  const stockRows = s.skus.filter((k) => s.productById[k.productId]?.trackStock !== false).map((k) => ({
    品項: skuLabel(k, s.productById[k.productId]), 初始庫存: s.stockInit[k.id]?.initial ?? 0, 目前庫存: s.stock[k.id] ?? 0, 定價: k.price, 活動價: k.promoPrice ?? ''
  }))
  add('庫存', stockRows)

  // 5. 庫存異動
  const moves = []
  for (const o of orders) for (const m of orderMoves(o)) moves.push({ 日期: o.day, 時間: timeOf(o.ts), 品項: s.labelOf(m.skuId), 異動: m.delta, 原因: m.reason, 單號: no[o.id] })
  for (const a of s.adjustments) moves.push({ 日期: a.day, 時間: timeOf(a.ts), 品項: a.name || s.labelOf(a.skuId), 異動: a.delta, 原因: '手動調整：' + a.reason + (a.note ? '・' + a.note : ''), 單號: '' })
  moves.sort((a, b) => (a.日期 + a.時間).localeCompare(b.日期 + b.時間))
  add('庫存異動', moves)

  // 完售紀錄
  add('完售紀錄', soldOutTimes(s.stockInit, orders, s.adjustments).map((x) => ({ 品項: s.labelOf(x.skuId), 完售日期: x.day, 完售時間: timeOf(x.ts), 賣出數量: x.sold })))
  add('耗材', supplyRows(s.supplyItems, s.supplies).map((x) => ({ 耗材: x.name, 單位: x.unit, 展前準備: x.prep ?? '', 展後剩餘: x.left ?? '', 本次用量: x.used ?? '' })))

  // 6. 零錢對帳
  const cashRows = []
  for (const d of [...days, ...extra].sort()) {
    const open = s.cashCounts[`${d}_open`], close = s.cashCounts[`${d}_close`]
    const openTotal = open ? countTotal(open.counts) : 0
    const e = expectedCash(orders, d, openTotal, s.cashMoves)
    if (!open && !close && !e.cashSales) continue
    cashRows.push({
      日期: d, 開店零用金: openTotal, 現金收支: e.cashSales, 現金調整: e.adjustments, 應有現金: e.expected,
      收攤實點: close ? countTotal(close.counts) : '', 差額: close ? countTotal(close.counts) - e.expected : '',
      開店面額: open ? fmtCounts(open.counts) : '', 收攤面額: close ? fmtCounts(close.counts) : ''
    })
  }
  for (const c of s.cashMoves) cashRows.push({ 日期: c.day, 開店零用金: '', 現金收支: '', 現金調整: c.amount, 應有現金: '', 收攤實點: '', 差額: '', 開店面額: '調整原因：' + c.reason + (c.note ? '・' + c.note : ''), 收攤面額: '' })
  add('零錢對帳', cashRows)

  // 7. 退換貨
  add('退換貨', orders.filter((o) => o.type === 'return' || o.type === 'exchange' || o.type === 'cancelPre').map((o) => ({
    單號: no[o.id], 日期: o.day, 時間: timeOf(o.ts), 類型: TYPE_LABEL[o.type], 狀態: status(o), 原單號: no[o.refOrderId] || '',
    退回品項: (o.rets || []).map((r) => `${r.name}×${r.qty}${r.restock ? '' : '（瑕疵）'}`).join('、'),
    換出品項: (o.items || []).map((i) => `${i.name}×${i.qty}`).join('、'),
    收付金額: o.money?.amount || 0, 方式: METHOD_LABEL[o.money?.method] || ''
  })))

  // 8. 預購單（含收件資料）
  const preOf = preIndex(orders)
  add('預購單', orders.filter((o) => o.pre && o.status !== 'void').map((o) => {
    const sh = s.shipping[o.id] || {}
    const ps = preOf(o)
    return {
      單號: no[o.id], 日期: o.day, 狀態: ps.cancelled ? '已取消' : o.pre.shipped ? '已出貨' : '未出貨',
      品項: (o.items || []).filter((i) => i.pre).map((i) => `${i.name}×${i.qty}`).join('、'),
      付款方式: PAY_TYPE_LABEL[o.pre.payType] || '', 預購金額含運: o.pre.preTotal, 運費: o.shippingFee || 0, 已收: ps.paid,
      待收: ps.cancelled ? 0 : ps.left, 收件人: sh.name || '', 電話: sh.phone || '', 地址: sh.address || '', 備註: sh.note || ''
    }
  }))

  return out
}

const fmtCounts = (c = {}) => Object.entries(c).filter(([, n]) => Number(n)).sort((a, b) => b[0] - a[0]).map(([d, n]) => `${d}×${n}`).join(' ')

// 價目表：依類別順序 → 商品順序 → 規格順序，只列上架中的品項
export function priceListRows(s) {
  const skus = s.skus.filter((k) => k.active !== false && s.productById[k.productId] && s.productById[k.productId].active !== false)
  const prods = s.products.filter((p) => p.active !== false && skus.some((k) => k.productId === p.id))
  const cats = sortCats([...new Set(prods.map((p) => p.category || '未分類'))], s.settings.catOrder)
  const rows = []
  for (const c of cats) {
    for (const p of prods.filter((x) => (x.category || '未分類') === c)) {
      for (const k of skus.filter((x) => x.productId === p.id)) {
        rows.push({ 類別: c, 品項: p.name, 規格: [k.award, ...(k.opts || [])].filter(Boolean).join('・'), 單位: p.unit || '', 定價: k.price || 0, 活動價: k.promoPrice ?? '' })
      }
    }
  }
  return rows
}

export async function exportPriceList(s) {
  const name = safeName(`${s.shop?.name || '攤位'}-價目表-${new Date().toISOString().slice(0, 10)}.xlsx`)
  const target = await pickSaveTarget(name)
  if (target === 'cancel') return false
  const XLSX = await import('xlsx')
  const rows = priceListRows(s)
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 說明: '尚無上架品項' }])
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 6 }, { wch: 8 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '價目表')
  await saveWorkbook(XLSX, wb, name, target)
  return true
}
